'use strict';

const crypto = require('crypto');

/**
 * Deterministic seeded PRNG (mulberry32). Used for daily challenges so every
 * player receives the same logical set and generation is auditable.
 */
function seededRandom(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hashToInt(String(seed));
    return function next() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashToInt(str) {
    const h = crypto.createHash('sha256').update(str).digest();
    return h.readUInt32BE(0);
}

function secureRandom() {
    return crypto.randomInt(0, 2 ** 31) / 2 ** 31;
}

/** Fisher–Yates shuffle using the supplied rng (defaults to secure random). */
function shuffle(array, rng = secureRandom) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function pick(array, rng = secureRandom) {
    if (!array.length) return undefined;
    return array[Math.floor(rng() * array.length)];
}

function randomId(bytes = 12) {
    return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { seededRandom, hashToInt, secureRandom, shuffle, pick, randomId };
