'use strict';

const LeaderboardRecord = require('../../models/LeaderboardRecord');
const config = require('../../config');
const logger = require('../../utilities/logger');

function dateKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
}

/** ISO week key, e.g. 2026-W38. */
function weekKey(d = new Date()) {
    const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function upsert(board, periodKey, player, update) {
    try {
        await LeaderboardRecord.updateOne(
            { board, periodKey, playerKey: player.key },
            { ...update, $setOnInsert: { board, periodKey, playerKey: player.key, userId: player.userId || null } },
            { upsert: true }
        );
    } catch (err) {
        logger.error('leaderboard_update_failed', { board, periodKey, message: err.message });
    }
}

/** Called once per completed session. */
async function recordSessionResult(player, session, lyricIqValue) {
    const now = session.endedAt || new Date();
    const displayName = player.displayName || 'Guest';
    if (session.dailyDateKey) {
        await upsert('DAILY', session.dailyDateKey, player, {
            $max: { value: session.score, secondary: session.correctCount },
            $set: { displayName, meta: { correct: session.correctCount, bestStreak: session.bestStreak, averageResponseMs: avgResponse(session) } }
        });
    }
    await upsert('WEEKLY', weekKey(now), player, {
        $inc: { value: session.score, secondary: 1 },
        $set: { displayName }
    });
    if (lyricIqValue !== null && lyricIqValue !== undefined) {
        await upsert('ALL_TIME', 'all', player, {
            $set: { value: lyricIqValue, displayName },
            $inc: { secondary: session.score }
        });
    }
}

function avgResponse(session) {
    const answered = session.correctCount + session.wrongCount;
    return answered ? Math.round(session.totalResponseMs / answered) : 0;
}

/** Public board listing (registered players only) plus the caller's own row. */
async function getBoard(board, { periodKey, limit = config.leaderboards.pageSize, playerKey = null } = {}) {
    const key = periodKey || (board === 'DAILY' ? dateKey() : board === 'WEEKLY' ? weekKey() : 'all');
    const rows = await LeaderboardRecord.find({ board, periodKey: key, userId: { $ne: null } })
        .sort({ value: -1, secondary: -1, updatedAt: 1 })
        .limit(limit)
        .lean();
    const entries = rows.map((r, i) => ({ rank: i + 1, displayName: r.displayName, value: r.value, secondary: r.secondary, meta: r.meta || {}, isYou: playerKey === r.playerKey }));
    let me = null;
    if (playerKey) {
        const mine = await LeaderboardRecord.findOne({ board, periodKey: key, playerKey }).lean();
        if (mine) {
            const better = await LeaderboardRecord.countDocuments({ board, periodKey: key, userId: { $ne: null }, $or: [{ value: { $gt: mine.value } }, { value: mine.value, secondary: { $gt: mine.secondary } }] });
            me = { rank: mine.userId ? better + 1 : null, value: mine.value, secondary: mine.secondary, displayName: mine.displayName, ranked: !!mine.userId };
        }
    }
    return { board, periodKey: key, entries, me };
}

/** Move a guest's rows onto a user, merging where the user already has a row for the period. */
async function migrateGuest(guestKey, user, lyricIqValue = null) {
    const userKey = `user:${user._id}`;
    const rows = await LeaderboardRecord.find({ playerKey: guestKey }).lean();
    for (const row of rows) {
        const existing = await LeaderboardRecord.findOne({ board: row.board, periodKey: row.periodKey, playerKey: userKey }).lean();
        if (!existing) {
            await LeaderboardRecord.updateOne({ _id: row._id }, { $set: { playerKey: userKey, userId: user._id, displayName: user.name } });
            continue;
        }
        const update = row.board === 'WEEKLY'
            ? { $inc: { value: row.value, secondary: row.secondary } }
            : { $max: { value: row.value, secondary: row.secondary } };
        await LeaderboardRecord.updateOne({ _id: existing._id }, update);
        await LeaderboardRecord.deleteOne({ _id: row._id });
    }
    if (lyricIqValue !== null && lyricIqValue !== undefined) {
        await upsert('ALL_TIME', 'all', { key: userKey, userId: user._id }, { $set: { value: lyricIqValue, displayName: user.name } });
    }
}

module.exports = { recordSessionResult, getBoard, dateKey, weekKey, migrateGuest };
