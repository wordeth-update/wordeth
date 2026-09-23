'use strict';

/**
 * An advertiser's prepaid balance.
 *
 * Money is taken before delivery, not invoiced after it, which removes
 * credit risk and collections entirely. A campaign stops being served the
 * moment the account behind it is empty, so an advertiser can never owe
 * anything and a reader is never shown an ad nobody is paying for.
 *
 * Every change is one atomic update plus a ledger row.
 */

const Advertiser = require('../models/Advertiser');
const AdLedger = require('../models/AdLedger');
const AdInvoice = require('../models/AdInvoice');

const round = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

/** Add money after a completed payment. Idempotent on the Stripe session id. */
async function credit({ advertiserId, amount, stripeSessionId = null, type = 'top_up', description = '' }) {
    const value = round(amount);
    if (!(value > 0)) throw new Error('A credit must be a positive amount');

    if (stripeSessionId) {
        const already = await AdLedger.findOne({ stripeSessionId }).select('_id balanceAfter').lean();
        if (already) return { credited: 0, balance: already.balanceAfter, duplicate: true };
    }

    const after = await Advertiser.findByIdAndUpdate(
        advertiserId,
        { $inc: { 'billing.balance': value } },
        { new: true }
    ).select('billing');
    if (!after) throw new Error('No such advertiser');

    const balance = round(after.billing?.balance);
    if (balance !== after.billing?.balance) {
        await Advertiser.updateOne({ _id: advertiserId }, { $set: { 'billing.balance': balance } });
    }

    try {
        const row = { advertiserId, type, amount: value, balanceAfter: balance, description };
        if (stripeSessionId) row.stripeSessionId = stripeSessionId;
        await AdLedger.create(row);
    } catch (e) {
        // Two webhooks for one payment can race; the unique index settles it.
        if (e && e.code === 11000) return { credited: 0, balance, duplicate: true };
        throw e;
    }
    return { credited: value, balance, duplicate: false };
}

/**
 * Charge one delivered event to the account.
 *
 * A prepaid account has the money taken from its balance. An invoiced
 * account accrues the amount instead, to be billed at the end of the
 * period. Either way a ledger row is written, so a later invoice is
 * assembled from recorded fact rather than recomputed.
 */
async function debit({ advertiserId, amount, adId, type, description = '' }) {
    const advertiser = await Advertiser.findById(advertiserId).select('billing');
    if (!advertiser) return { charged: 0, balance: 0, empty: true };

    const invoiced = advertiser.billing?.mode === 'invoiced';
    const value = round(amount);
    if (!(value > 0)) {
        return {
            charged: 0,
            balance: round(advertiser.billing?.balance),
            empty: !invoiced && !(round(advertiser.billing?.balance) > 0)
        };
    }

    const inc = { 'billing.totalSpent': value };
    if (invoiced) inc['billing.outstanding'] = value;
    else inc['billing.balance'] = -value;

    const after = await Advertiser.findByIdAndUpdate(advertiserId, { $inc: inc }, { new: true }).select('billing');
    if (!after) return { charged: 0, balance: 0, empty: true };

    const balance = round(after.billing?.balance);
    const outstanding = round(after.billing?.outstanding);
    const totalSpent = round(after.billing?.totalSpent);
    await Advertiser.updateOne({ _id: advertiserId }, {
        $set: { 'billing.balance': balance, 'billing.outstanding': outstanding, 'billing.totalSpent': totalSpent }
    });

    try {
        await AdLedger.create({
            advertiserId, type, amount: -value,
            balanceAfter: invoiced ? -outstanding : balance,
            adId, description
        });
    } catch (e) {
        // The money already moved; a missing row would under-bill an invoice,
        // so this is loud rather than swallowed.
        console.error('[ads] ledger write failed for', String(advertiserId), type, e.message);
    }

    const limit = round(after.billing?.creditLimit);
    const empty = invoiced ? (limit > 0 && outstanding >= limit) : balance <= 0;
    return { charged: value, balance, outstanding, empty };
}

/**
 * Advertisers whose ads may be served right now.
 *
 * Prepaid: money in the account. Invoiced: inside the agreed credit limit
 * and nothing overdue. An account marked past due serves nothing whatever
 * its limit says, which is the whole point of terms.
 */
async function fundedAdvertiserIds() {
    const rows = await Advertiser.find({
        $or: [
            { 'billing.mode': { $ne: 'invoiced' }, 'billing.balance': { $gt: 0 } },
            {
                'billing.mode': 'invoiced',
                'billing.pastDue': { $ne: true },
                $or: [
                    { 'billing.creditLimit': { $lte: 0 } },
                    { $expr: { $lt: ['$billing.outstanding', '$billing.creditLimit'] } }
                ]
            }
        ]
    }).select('_id').lean();
    return rows.map((r) => r._id);
}

/**
 * Mark accounts whose invoices have passed their due date, and clear the
 * mark from any that have since settled. Safe to run as often as you like.
 */
async function refreshPastDue() {
    const now = new Date();
    const overdue = await AdInvoice.distinct('advertiserId', { status: 'open', dueAt: { $lt: now } });
    const marked = await Advertiser.distinct('_id', { 'billing.pastDue': true });

    const overdueSet = new Set(overdue.map(String));
    const toClear = marked.filter((id) => !overdueSet.has(String(id)));

    if (overdue.length) await Advertiser.updateMany({ _id: { $in: overdue } }, { $set: { 'billing.pastDue': true } });
    if (toClear.length) await Advertiser.updateMany({ _id: { $in: toClear } }, { $set: { 'billing.pastDue': false } });
    return { nowPastDue: overdue.length, cleared: toClear.length };
}

module.exports = { credit, debit, fundedAdvertiserIds, refreshPastDue, round };
