'use strict';

/**
 * Keeping people safe from each other.
 *
 * Blocking is mutual in effect: whichever of the two did it, neither can
 * message the other, join the other's room, dap the other up, or see the
 * other's profile. The word filter is deliberately narrow — slurs and
 * explicit threats, not swearing — and masks rather than refuses, so a
 * message still lands and the report trail keeps the original.
 */
const User = require('../models/User');

function sameId(a, b) {
    return !!a && !!b && String(a) === String(b);
}

/** Either has blocked the other. Takes ids; loads the two block lists. */
async function blockedBetween(aId, bId) {
    if (!aId || !bId || sameId(aId, bId)) return false;
    const pair = await User.find({ _id: { $in: [aId, bId] } }).select('blockedUserIds').lean();
    const a = pair.find((u) => sameId(u._id, aId));
    const b = pair.find((u) => sameId(u._id, bId));
    return !!((a && (a.blockedUserIds || []).some((id) => sameId(id, bId)))
        || (b && (b.blockedUserIds || []).some((id) => sameId(id, aId))));
}

/** Ids of everyone this person has blocked or been blocked by, for filtering lists. */
async function hiddenFrom(userId) {
    const me = await User.findById(userId).select('blockedUserIds').lean();
    const mine = (me && me.blockedUserIds) || [];
    const theirs = await User.find({ blockedUserIds: userId }).select('_id').lean();
    return new Set([...mine.map(String), ...theirs.map((u) => String(u._id))]);
}

/**
 * Words that are never acceptable here. Kept short on purpose: this is
 * not a swear filter, and a list that is too wide masks ordinary talk.
 * Each entry matches as a whole word, letters only, any case.
 */
const BLOCKED_WORDS = [
    'nigger', 'nigga', 'faggot', 'fag', 'kike', 'spic', 'chink', 'wetback', 'tranny', 'retard',
    'kill yourself', 'kys', 'rape you', 'raping you'
].map((w) => new RegExp('\\b' + w.replace(/\s+/g, '\\s+') + '\\b', 'gi'));

/** Mask what is never acceptable. Says whether anything was masked. */
function cleanText(text) {
    if (typeof text !== 'string' || !text) return { text, flagged: false };
    let flagged = false;
    let out = text;
    for (const re of BLOCKED_WORDS) {
        out = out.replace(re, (m) => { flagged = true; return m[0] + '*'.repeat(Math.max(1, m.length - 1)); });
    }
    return { text: out, flagged };
}

/** Whether an account is suspended right now, and the words to say so. */
function suspension(user) {
    if (!user || !user.suspendedUntil) return null;
    if (new Date(user.suspendedUntil).getTime() <= Date.now()) return null;
    const forever = new Date(user.suspendedUntil).getFullYear() >= 2500;
    return forever
        ? 'This account has been closed for breaking the rules.'
        : `This account is suspended until ${new Date(user.suspendedUntil).toLocaleDateString('en-US')}.`;
}

module.exports = { blockedBetween, hiddenFrom, cleanText, suspension, sameId };
