'use strict';

/**
 * Raising and settling invoices for advertisers on credit terms.
 *
 * An invoice covers a closed period and is built from ledger rows already
 * written when the delivery happened, so it reports what was recorded
 * rather than recalculating what might have been. Paying one reduces the
 * outstanding balance by exactly what was paid.
 */

const Advertiser = require('../models/Advertiser');
const AdInvoice = require('../models/AdInvoice');
const AdLedger = require('../models/AdLedger');
const Ad = require('../models/Ad');
const adCredit = require('./adCredit');

const round = adCredit.round;

/** Sequential, readable, and unique per month: WA-2026-09-0007. */
async function nextNumber(when = new Date()) {
    const stamp = `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`;
    const prefix = `WA-${stamp}-`;
    const last = await AdInvoice.findOne({ number: new RegExp('^' + prefix) }).sort({ number: -1 }).select('number').lean();
    const n = last ? Number(String(last.number).slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
}

/** The month before the one containing `when`, as a closed period. */
function lastMonth(when = new Date()) {
    const end = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
    return { periodStart: start, periodEnd: end };
}

/**
 * Raise an invoice for one advertiser covering a period.
 * Returns null when there is nothing to bill, which is not an error.
 */
async function raiseInvoice(advertiserId, { periodStart, periodEnd } = lastMonth()) {
    const advertiser = await Advertiser.findById(advertiserId).select('billing companyName email');
    if (!advertiser) throw new Error('No such advertiser');
    if (advertiser.billing?.mode !== 'invoiced') throw new Error('That account is prepaid, so there is nothing to invoice');

    const existing = await AdInvoice.findOne({ advertiserId, periodStart, periodEnd, status: { $ne: 'void' } }).lean();
    if (existing) return await AdInvoice.findById(existing._id);

    // Group the period's delivery by campaign, from what was recorded at the time.
    const rows = await AdLedger.aggregate([
        {
            $match: {
                advertiserId: advertiser._id,
                type: { $in: ['impression', 'click'] },
                createdAt: { $gte: periodStart, $lt: periodEnd }
            }
        },
        {
            $group: {
                _id: '$adId',
                amount: { $sum: '$amount' },
                impressions: { $sum: { $cond: [{ $eq: ['$type', 'impression'] }, 1, 0] } },
                clicks: { $sum: { $cond: [{ $eq: ['$type', 'click'] }, 1, 0] } }
            }
        }
    ]);
    if (!rows.length) return null;

    const ads = await Ad.find({ _id: { $in: rows.map((r) => r._id).filter(Boolean) } }).select('title').lean();
    const titleOf = new Map(ads.map((a) => [String(a._id), a.title]));

    const lines = rows.map((r) => ({
        adId: r._id || null,
        title: titleOf.get(String(r._id)) || 'Campaign',
        impressions: r.impressions,
        clicks: r.clicks,
        amount: round(Math.abs(r.amount))
    })).sort((a, b) => b.amount - a.amount);

    const subtotal = round(lines.reduce((sum, l) => sum + l.amount, 0));
    if (!(subtotal > 0)) return null;

    const termsDays = Number(advertiser.billing?.termsDays) || 30;
    const issuedAt = new Date();
    const dueAt = new Date(issuedAt.getTime() + termsDays * 24 * 60 * 60 * 1000);

    return await AdInvoice.create({
        number: await nextNumber(issuedAt),
        advertiserId: advertiser._id,
        periodStart,
        periodEnd,
        lines,
        subtotal,
        total: subtotal,
        issuedAt,
        dueAt
    });
}

/** Raise invoices for every account on terms with delivery in the period. */
async function raiseAllInvoices(period = lastMonth()) {
    const accounts = await Advertiser.find({ 'billing.mode': 'invoiced' }).select('_id').lean();
    const raised = [];
    for (const a of accounts) {
        try {
            const inv = await raiseInvoice(a._id, period);
            if (inv) raised.push(inv);
        } catch (e) {
            console.error('[ads] invoice failed for', String(a._id), e.message);
        }
    }
    await adCredit.refreshPastDue();
    return raised;
}

/**
 * Record a payment against an invoice, whole or partial.
 * Reduces the account's outstanding balance by the amount paid.
 */
async function recordPayment(invoiceId, { amount = null, stripeSessionId = null, note = '' } = {}) {
    const invoice = await AdInvoice.findById(invoiceId);
    if (!invoice) throw new Error('No such invoice');
    if (invoice.status === 'void') throw new Error('That invoice was voided');
    if (stripeSessionId && invoice.stripeSessionId === stripeSessionId) return invoice;

    const due = round(invoice.total - invoice.amountPaid);
    const paid = round(amount === null ? due : Math.min(round(amount), due));
    if (!(paid > 0)) return invoice;

    invoice.amountPaid = round(invoice.amountPaid + paid);
    if (stripeSessionId) invoice.stripeSessionId = stripeSessionId;
    if (note) invoice.notes = note;
    if (invoice.amountPaid >= invoice.total) {
        invoice.status = 'paid';
        invoice.paidAt = new Date();
    }
    await invoice.save();

    const after = await Advertiser.findByIdAndUpdate(
        invoice.advertiserId,
        { $inc: { 'billing.outstanding': -paid } },
        { new: true }
    ).select('billing');
    if (after) {
        // Never let a rounding tail leave a negative owing.
        const outstanding = Math.max(0, round(after.billing?.outstanding));
        await Advertiser.updateOne({ _id: invoice.advertiserId }, { $set: { 'billing.outstanding': outstanding } });
    }

    try {
        const row = {
            advertiserId: invoice.advertiserId,
            type: 'top_up',
            amount: paid,
            balanceAfter: after ? -Math.max(0, round(after.billing?.outstanding)) : 0,
            description: `Payment for invoice ${invoice.number}`
        };
        if (stripeSessionId) row.stripeSessionId = stripeSessionId;
        await AdLedger.create(row);
    } catch (e) {
        console.error('[ads] invoice payment ledger write failed for', invoice.number, e.message);
    }

    await adCredit.refreshPastDue();
    return invoice;
}

module.exports = { raiseInvoice, raiseAllInvoices, recordPayment, lastMonth, nextNumber };
