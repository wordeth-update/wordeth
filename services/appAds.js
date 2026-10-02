'use strict';

/**
 * Ads in the phone app.
 *
 * The website shows banners. The app shows placements that are drawn by
 * the app itself, in the shape of the thing around them, each marked AD:
 *
 *   app-lyrics       a row in the lyrics search results, like a song
 *   app-messages     a row in the conversation list; can offer a pound
 *   app-room-strip   a slim strip along the bottom of a room
 *   app-photo-slide  a second page behind a photo shared in a room
 *   app-merch        a small unit under the buy button
 *   app-takeover     a sponsor break in a paid room, started by the host
 *
 * RELEVANCE IS THE RULE. An ad with keywords is only ever shown where one
 * of its keywords fits the moment, and "the moment" is two things:
 *
 *   the context — what is on screen: the search, the song and artist, the
 *   room's name and topic, the product. A fit here counts double.
 *
 *   the person — the songs and artists they have looked up lately. A fit
 *   here counts once, and is what makes a placement with no context of its
 *   own (the messages list) still land with the right people.
 *
 * Among ads that fit, only the best fit is in the running. Ads that fit
 * equally well share the slot in proportion to bid × on-ramp strength
 * (services/adRamp.js): a higher bid is shown more often, and an ad that
 * has just started or resumed is shown less often for its first day. An
 * ad with NO keywords is run-of-app: it fits everywhere, scores nothing,
 * and so only shows where no targeted ad fits better.
 */

const Ad = require('../models/Ad');
const adCredit = require('./adCredit');
const adRamp = require('./adRamp');

const APP_PLACEMENTS = {
    'app-lyrics': { size: 'native', label: 'Lyrics search — native song row' },
    'app-messages': { size: 'native', label: 'Messages — native conversation row' },
    'app-room-strip': { size: 'native', label: 'Room — bottom strip' },
    'app-photo-slide': { size: 'slide', label: 'Room — slide behind a shared photo' },
    'app-merch': { size: 'native', label: 'Merch — under the buy button' },
    'app-takeover': { size: 'takeover', label: 'Paid room — sponsor takeover' }
};

/** Words too common to mean anything about what somebody is into. */
const STOP = new Set(['the', 'and', 'for', 'you', 'feat', 'with', 'from', 'that', 'this', 'your', 'are', 'not', 'all', 'out', 'remix', 'version', 'live', 'edit']);

/** Lowercased, punctuation to spaces, padded, so a keyword can be found as whole words. */
function normalise(text) {
    return ` ${String(text || '').toLowerCase().replace(/[^a-z0-9$]+/g, ' ').trim()} `;
}

/** Does the keyword (a word or a phrase) appear in the text as whole words? */
function fits(keyword, text) {
    const k = normalise(keyword).trim();
    if (k.length < 2 || STOP.has(k)) return false;
    return text.includes(` ${k} `);
}

/** What somebody is into, as text: the songs and artists they looked up most recently. */
function interestsOf(user) {
    if (!user || !Array.isArray(user.searchHistory)) return '';
    return user.searchHistory.slice(0, 40).map((h) => `${h.songTitle || ''} ${h.artist || ''}`).join(' ');
}

/** How well one ad fits. Zero for a run-of-app ad; -1 for a targeted ad that does not fit at all. */
function score(ad, contextText, interestText) {
    const keywords = (ad.keywords || []).filter(Boolean);
    if (keywords.length === 0) return 0;
    let total = 0;
    for (const k of keywords) {
        if (fits(k, contextText)) total += 2;
        else if (fits(k, interestText)) total += 1;
    }
    return total > 0 ? total : -1;
}

/**
 * The ad for one placement right now, or null.
 * @param placement one of APP_PLACEMENTS
 * @param context   free text describing what is on screen
 * @param user      the signed-in user, when there is one
 */
async function pick(placement, context, user, extra = {}) {
    if (!APP_PLACEMENTS[placement]) return null;
    const funded = await adCredit.fundedAdvertiserIds();
    if (!funded.length) return null;

    const query = { ...Ad.runningQuery(), placement, advertiserId: { $in: funded }, ...extra };
    const ads = await Ad.find(query).populate('advertiserId', 'companyName chatUserId').limit(200);
    if (!ads.length) return null;

    const contextText = normalise(context);
    const interestText = normalise(interestsOf(user));
    const fitting = ads
        .map((ad) => ({ ad, s: score(ad, contextText, interestText) }))
        .filter((x) => x.s >= 0);
    if (!fitting.length) return null;
    const best = Math.max(...fitting.map((x) => x.s));
    return adRamp.share(fitting.filter((x) => x.s === best).map((x) => x.ad));
}

module.exports = { APP_PLACEMENTS, pick, score, fits, normalise, interestsOf };
