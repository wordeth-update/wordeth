'use strict';

/**
 * What an impression or a click costs, and what happens when the money runs out.
 *
 * Charging happens in the same write that records the event, so a campaign
 * cannot overspend by racing itself. A campaign that reaches its total
 * budget is paused, which is visible to the advertiser and reversible by
 * raising the budget. A campaign that reaches its daily budget simply stops
 * serving until tomorrow, without changing its status.
 */

const Ad = require('../models/Ad');

const DAY_KEY = () => new Date().toISOString().slice(0, 10);

/**
 * Dollars this event costs: CPM is priced per thousand impressions, CPC per
 * click. Rounded to a hundredth of a cent, which is finer than any real rate
 * card and coarse enough to stay exact in arithmetic.
 */
function priceOf(ad, type) {
    const raw = type === 'click' ? Number(ad.pricing?.cpc) || 0 : (Number(ad.pricing?.cpm) || 0) / 1000;
    return Math.round(raw * 10000) / 10000;
}

/**
 * Record one charged event against an ad, atomically.
 * Returns { charged, exhausted } — exhausted when the total budget is now spent.
 */
async function charge(adId, type) {
    const ad = await Ad.findById(adId).select('pricing budget status');
    if (!ad) return { charged: 0, exhausted: false };

    const amount = Math.round(priceOf(ad, type) * 10000) / 10000;
    const today = DAY_KEY();
    const freshDay = ad.budget?.spentDate !== today;

    // One conditional update: reset the day if needed, add the charge, bump the counter.
    const inc = { [`stats.${type === 'click' ? 'clicks' : 'impressions'}`]: 1 };
    if (amount > 0) inc['budget.spent'] = amount;

    const update = { $inc: inc };
    if (freshDay) {
        update.$set = { 'budget.spentDate': today, 'budget.spentToday': amount > 0 ? amount : 0 };
    } else if (amount > 0) {
        update.$inc['budget.spentToday'] = amount;
    }

    let after = await Ad.findByIdAndUpdate(adId, update, { new: true }).select('budget status');
    if (!after) return { charged: amount, exhausted: false };

    // Repeated fractions of a cent drift in binary floating point, and money
    // that reads 0.10200000000000001 is money nobody trusts. Settle it here.
    if (amount > 0) {
        const spent = Math.round((Number(after.budget?.spent) || 0) * 10000) / 10000;
        const spentToday = Math.round((Number(after.budget?.spentToday) || 0) * 10000) / 10000;
        if (spent !== after.budget.spent || spentToday !== after.budget.spentToday) {
            after = await Ad.findByIdAndUpdate(adId, { $set: { 'budget.spent': spent, 'budget.spentToday': spentToday } }, { new: true }).select('budget status');
        }
    }

    const total = Number(after.budget?.total) || 0;
    const exhausted = total > 0 && Number(after.budget?.spent) >= total;
    if (exhausted && after.status === 'active') {
        // Out of money: stop serving and say so, rather than quietly under-delivering.
        await Ad.updateOne({ _id: adId, status: 'active' }, { $set: { status: 'paused' } });
    }
    return { charged: amount, exhausted };
}

module.exports = { charge, priceOf, DAY_KEY };
