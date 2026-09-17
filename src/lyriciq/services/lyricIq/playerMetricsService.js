'use strict';

const PlayerMetrics = require('../../models/PlayerMetrics');
const config = require('../../config');
const logger = require('../../utilities/logger');

/**
 * Maintains the per-player knowledge graph. All writes are atomic $inc/$max
 * updates so concurrent answers never race.
 */
const SAFE_KEY = /[^a-z0-9_-]/g;
const safeKey = (v) => String(v || 'other').toLowerCase().replace(SAFE_KEY, '').slice(0, 60) || 'other';

function bucketIncrements(prefix, { correct, difficulty, responseTimeMs, points }) {
    return {
        [`${prefix}.attempts`]: 1,
        [`${prefix}.correct`]: correct ? 1 : 0,
        [`${prefix}.sumDifficulty`]: difficulty,
        [`${prefix}.sumDifficultyCorrect`]: correct ? difficulty : 0,
        [`${prefix}.sumResponseMs`]: responseTimeMs,
        [`${prefix}.points`]: points
    };
}

async function ensureMetrics(player) {
    return PlayerMetrics.findOneAndUpdate(
        { playerKey: player.key },
        { $setOnInsert: { playerKey: player.key, userId: player.userId || null, guestId: player.guestId || null } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

/** Record one answered question. */
async function recordAnswer(player, attempt) {
    const facts = { correct: attempt.correct, difficulty: attempt.difficulty, responseTimeMs: attempt.responseTimeMs, points: attempt.pointsAwarded };
    const inc = {
        ...bucketIncrements('totals', facts),
        ...bucketIncrements(`byGenre.${safeKey(attempt.trackDimensions?.genre)}`, facts),
        ...bucketIncrements(`byDecade.${safeKey(attempt.trackDimensions?.decade || 'unknown')}`, facts),
        ...bucketIncrements(`byMode.${safeKey(attempt.gameMode)}`, facts),
        ...bucketIncrements(`byTemplate.${safeKey(attempt.template)}`, facts),
        ...bucketIncrements(`byArtist.${safeKey(attempt.trackDimensions?.artistKey || 'unknown')}`, facts),
        'totals.recallAttempts': attempt.skill === 'RECALL' ? 1 : 0,
        'totals.recallCorrect': attempt.skill === 'RECALL' && attempt.correct ? 1 : 0,
        'totals.recognitionAttempts': attempt.skill === 'RECOGNITION' ? 1 : 0,
        'totals.recognitionCorrect': attempt.skill === 'RECOGNITION' && attempt.correct ? 1 : 0,
        'totals.typedAttempts': attempt.answerType === 'TYPED' ? 1 : 0,
        'totals.typedCorrect': attempt.answerType === 'TYPED' && attempt.correct ? 1 : 0,
        totalScore: attempt.pointsAwarded
    };
    try {
        await PlayerMetrics.updateOne(
            { playerKey: player.key },
            { $inc: inc, $setOnInsert: { playerKey: player.key, userId: player.userId || null, guestId: player.guestId || null } },
            { upsert: true }
        );
    } catch (err) {
        logger.error('metrics_update_failed', { playerKey: player.key, message: err.message });
    }
}

/** Record a completed session (accuracy history, streak and score highs). */
async function recordSessionComplete(player, session) {
    const answered = session.correctCount + session.wrongCount;
    const accuracy = answered ? session.correctCount / answered : 0;
    try {
        await PlayerMetrics.updateOne(
            { playerKey: player.key },
            {
                $inc: { sessionsCompleted: 1 },
                $max: { bestStreak: session.bestStreak || 0, bestSessionScore: session.score || 0 },
                $push: { recentSessionAccuracies: { $each: [Number(accuracy.toFixed(3))], $slice: -config.lyricIq.recentSessionWindow } },
                $setOnInsert: { playerKey: player.key, userId: player.userId || null, guestId: player.guestId || null }
            },
            { upsert: true }
        );
    } catch (err) {
        logger.error('metrics_session_update_failed', { playerKey: player.key, message: err.message });
    }
}

async function getMetrics(playerKey) {
    return PlayerMetrics.findOne({ playerKey }).lean();
}

/** Merge a guest's metrics into a user's (guest → user migration). */
async function mergeGuestIntoUser(guestKey, user) {
    const guest = await PlayerMetrics.findOne({ playerKey: guestKey });
    if (!guest) return null;
    const userKey = `user:${user._id}`;
    const existing = await PlayerMetrics.findOne({ playerKey: userKey });
    if (!existing) {
        guest.playerKey = userKey;
        guest.userId = user._id;
        guest.guestId = null;
        await guest.save();
        return guest;
    }
    const addBuckets = (target, source) => {
        for (const [k, v] of Object.entries(source || {})) {
            if (typeof v === 'number') target[k] = (target[k] || 0) + v;
        }
    };
    addBuckets(existing.totals, guest.totals.toObject ? guest.totals.toObject() : guest.totals);
    for (const mapName of ['byGenre', 'byDecade', 'byMode', 'byTemplate', 'byArtist']) {
        for (const [key, bucket] of guest[mapName].entries()) {
            const current = existing[mapName].get(key) || {};
            const merged = { ...(current.toObject ? current.toObject() : current) };
            addBuckets(merged, bucket.toObject ? bucket.toObject() : bucket);
            existing[mapName].set(key, merged);
        }
    }
    existing.recentSessionAccuracies = existing.recentSessionAccuracies.concat(guest.recentSessionAccuracies).slice(-config.lyricIq.recentSessionWindow);
    existing.sessionsCompleted += guest.sessionsCompleted;
    existing.bestStreak = Math.max(existing.bestStreak, guest.bestStreak);
    existing.bestSessionScore = Math.max(existing.bestSessionScore, guest.bestSessionScore);
    existing.totalScore += guest.totalScore;
    existing.daily.completed += guest.daily.completed;
    existing.daily.bestStreak = Math.max(existing.daily.bestStreak, guest.daily.bestStreak);
    if (!existing.daily.lastDateKey || (guest.daily.lastDateKey && guest.daily.lastDateKey > existing.daily.lastDateKey)) {
        existing.daily.lastDateKey = guest.daily.lastDateKey;
        existing.daily.streak = guest.daily.streak;
    }
    await existing.save();
    await PlayerMetrics.deleteOne({ _id: guest._id });
    return existing;
}

module.exports = { ensureMetrics, recordAnswer, recordSessionComplete, getMetrics, mergeGuestIntoUser, safeKey };
