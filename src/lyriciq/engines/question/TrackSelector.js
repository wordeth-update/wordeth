'use strict';

const { pick } = require('../../utilities/random');

/**
 * Chooses a track from the eligible pool. Mildly popularity-weighted so early
 * questions skew recognisable, with `excludeTrackIds` preventing repeats in a
 * session and `preferGenre` used by category play.
 */
function selectTrack(tracks, { rng, excludeTrackIds = [], targetDifficulty = null } = {}) {
    const exclude = new Set(excludeTrackIds.map(String));
    let pool = tracks.filter((t) => !exclude.has(String(t._id)));
    if (!pool.length) pool = tracks.slice(); // allow repeats rather than starving the session
    if (!pool.length) return null;

    // Higher target difficulty → prefer less popular tracks; otherwise prefer popular.
    const weightFor = (t) => {
        const p = (t.popularity ?? 50) / 100;
        if (targetDifficulty === null) return 0.5 + p;
        const wantObscure = targetDifficulty / 100;
        return 0.35 + (1 - wantObscure) * p + wantObscure * (1 - p);
    };

    const weights = pool.map(weightFor);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) return pool[i];
    }
    return pick(pool, rng);
}

module.exports = { selectTrack };
