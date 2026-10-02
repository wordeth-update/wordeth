'use strict';

/**
 * The on-ramp, and how equal ads share a slot.
 *
 * An ad that has just started — new, approved, or resumed after a pause —
 * does not arrive at full strength. It joins at a quarter of its weight
 * and climbs in a straight line to all of it over a day. Two reasons:
 * ads already running are not knocked aside the moment somebody presses
 * Resume, and stopping and starting an ad is never a way to jump the
 * queue.
 *
 * The on-ramp only ever matters against competition. Relevance still
 * comes first: among the ads that fit a moment, the ones that fit BEST
 * are the only ones in the running. Those then share the slot in
 * proportion to weight = bid × on-ramp strength. An ad with nobody to
 * share with is shown every time, on-ramp or not: a slot is never left
 * empty to make a point.
 */

/** Strength the moment an ad starts. */
const RAMP_START = 0.25;
/** Hours to full strength. AD_RAMP_HOURS=0 switches the on-ramp off. */
function rampHours() {
    const n = Number(process.env.AD_RAMP_HOURS);
    return Number.isFinite(n) && n >= 0 ? n : 24;
}

/** 0.25 … 1: how much of its weight an ad carries right now. An ad from before on-ramps existed is at full strength. */
function strength(ad, now = Date.now()) {
    const hours = rampHours();
    const started = ad && ad.rampStartedAt ? new Date(ad.rampStartedAt).getTime() : NaN;
    if (!hours || !Number.isFinite(started)) return 1;
    const elapsed = Math.max(0, now - started) / (hours * 60 * 60 * 1000);
    return Math.min(1, RAMP_START + (1 - RAMP_START) * elapsed);
}

/** When an ad on the on-ramp reaches full strength, or null if it already has. */
function fullAt(ad, now = Date.now()) {
    const hours = rampHours();
    const started = ad && ad.rampStartedAt ? new Date(ad.rampStartedAt).getTime() : NaN;
    if (!hours || !Number.isFinite(started)) return null;
    const end = started + hours * 60 * 60 * 1000;
    return end > now ? new Date(end) : null;
}

/**
 * What an ad brings to a slot it has to share. A bid of nothing (a house
 * ad) still gets a sliver, so house ads rotate among themselves and give
 * way almost entirely to anything paid.
 */
function weight(ad, now = Date.now()) {
    const bid = Math.max(0.01, Number(ad && ad.pricing && ad.pricing.cpm) || 0);
    return bid * strength(ad, now);
}

/**
 * One of several ads that fit equally well, chosen in proportion to weight.
 * `random` is injectable so the proportions can be tested.
 */
function share(ads, now = Date.now(), random = Math.random) {
    if (!ads || ads.length === 0) return null;
    if (ads.length === 1) return ads[0];
    const weights = ads.map((ad) => weight(ad, now));
    const total = weights.reduce((a, b) => a + b, 0);
    let at = random() * total;
    for (let i = 0; i < ads.length; i++) {
        at -= weights[i];
        if (at < 0) return ads[i];
    }
    return ads[ads.length - 1];
}

module.exports = { RAMP_START, rampHours, strength, fullAt, weight, share };
