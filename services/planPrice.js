'use strict';

/**
 * What a plan costs per year, or null when it is not sold by the year.
 *
 * Only a plan with a yearly price of its own has one. The pricing page
 * used to make one up for the rest (twelve months less a fifth) while
 * checkout charged the plan's stored yearly price, which for those plans
 * is zero: the page showed a discount and the till rang up nothing. One
 * rule now, used by the page's data and by checkout.
 */
function yearlyPrice(plan) {
    const y = Number(plan && plan.priceYearly);
    return Number.isFinite(y) && y > 0 ? y : null;
}

/** The price for a billing cycle, or null if the plan is not sold that way. */
function priceFor(plan, cycle) {
    if (cycle === 'yearly') return yearlyPrice(plan);
    const m = Number(plan && plan.priceMonthly);
    return Number.isFinite(m) && m > 0 ? m : null;
}

module.exports = { yearlyPrice, priceFor };
