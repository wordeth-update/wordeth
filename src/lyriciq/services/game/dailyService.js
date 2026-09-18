'use strict';

const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../utilities/logger');
const { conflict, unavailable } = require('../../utilities/errors');
const DailyChallenge = require('../../models/DailyChallenge');
const GameSession = require('../../models/GameSession');
const PlayerMetrics = require('../../models/PlayerMetrics');
const QuestionInstance = require('../../models/QuestionInstance');
const { seededRandom } = require('../../utilities/random');
const { DAILY_SEQUENCE } = require('./gameModes');
const { cache } = require('../content/providerCache');
const metricsService = require('../lyricIq/playerMetricsService');
const { computeLyricIq } = require('../lyricIq/lyricIqService');
const leaderboardService = require('../leaderboard/leaderboardService');

function dateKeyFor(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

function seedFor(dateKey) {
    return crypto.createHash('sha256').update(`${config.daily.seedSalt}:${dateKey}`).digest('hex');
}

function previousDateKey(dateKey) {
    const d = new Date(`${dateKey}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return dateKeyFor(d);
}

/**
 * Generate the canonical challenge for a date. Deterministic given the seed and
 * catalog state; the stored specs are the audit record.
 */
async function generateChallenge(dateKey) {
    const sessionService = require('./sessionService');
    const engine = sessionService.getEngine();
    const seed = seedFor(dateKey);
    const rng = seededRandom(seed);
    const specs = [];
    const used = [];
    for (const step of DAILY_SEQUENCE.slice(0, config.daily.questionCount)) {
        const spec = await engine.generate({ gameMode: 'DAILY_10', template: step.template, answerType: step.answerType, rng, excludeTrackIds: used });
        if (!spec) continue;
        used.push(spec.trackId);
        specs.push({ ...spec, trackId: String(spec.trackId) });
    }
    if (specs.length < Math.min(5, config.daily.questionCount)) {
        throw unavailable('NO_ELIGIBLE_QUESTIONS', 'Not enough eligible content to build today\'s challenge.');
    }
    return { dateKey, seed, questionSpecs: specs, questionCount: specs.length, generatorVersion: 1 };
}

async function getOrCreateChallenge(dateKey = dateKeyFor()) {
    const cached = cache.get('dailyChallenge', dateKey);
    if (cached) return cached;
    let doc = await DailyChallenge.findOne({ dateKey }).select('+questionSpecs').lean();
    if (!doc) {
        const generated = await generateChallenge(dateKey);
        try {
            doc = (await DailyChallenge.create(generated)).toObject();
            doc.questionSpecs = generated.questionSpecs;
            logger.event('daily_generated', { dateKey, questionCount: generated.questionCount, seed: seed8(generated.seed) });
        } catch (err) {
            if (err.code !== 11000) throw err; // another instance won the race
            doc = await DailyChallenge.findOne({ dateKey }).select('+questionSpecs').lean();
        }
    }
    cache.set('dailyChallenge', dateKey, doc);
    return doc;
}

function seed8(seed) { return String(seed).slice(0, 8); }

async function questionSpecForIndex(dateKey, index) {
    const challenge = await getOrCreateChallenge(dateKey);
    const spec = challenge.questionSpecs[index];
    if (!spec) return null;
    const { _id, generation, ...rest } = spec; // eslint-disable-line no-unused-vars
    return rest;
}

/** Start (or resume) today's challenge for a player. */
async function startDaily(player) {
    const sessionService = require('./sessionService');
    const dateKey = dateKeyFor();
    const challenge = await getOrCreateChallenge(dateKey);
    let session = await GameSession.findOne({ playerKey: player.key, dailyDateKey: dateKey });
    if (session) {
        if (session.status === 'ACTIVE') {
            const { question } = await sessionService.getCurrentQuestion(session._id, player);
            return { session, question, resumed: true };
        }
        const results = await sessionService.getResults(session._id, player);
        throw conflict('DAILY_ALREADY_PLAYED', 'You have already played today\'s Daily 10.', { sessionId: String(session._id), results });
    }
    const metrics = await metricsService.getMetrics(player.key);
    try {
        session = await GameSession.create({
            playerKey: player.key,
            userId: player.userId || null,
            guestId: player.guestId || null,
            gameMode: 'DAILY_10',
            questionCount: challenge.questionCount,
            dailyDateKey: dateKey,
            scoreModelVersion: config.scoring.modelVersion,
            lyricIqBefore: metrics ? computeLyricIq(metrics).value : null
        });
    } catch (err) {
        if (err.code === 11000) return startDaily(player); // concurrent start → resume
        throw err;
    }
    await DailyChallenge.updateOne({ dateKey }, { $inc: { 'stats.plays': 1 } });
    logger.event('session_started', { sessionId: String(session._id), playerKey: player.key, gameMode: 'DAILY_10', dateKey, guest: player.isGuest });
    const question = await sessionService.serveNextQuestion(session, player);
    return { session, question, resumed: false };
}

/** Hook from sessionService.completeSession for daily sessions. */
async function onDailyCompleted(player, session) {
    const dateKey = session.dailyDateKey;
    await DailyChallenge.updateOne({ dateKey }, { $inc: { 'stats.completions': 1, 'stats.scoreTotal': session.score } });
    const metrics = await metricsService.ensureMetrics(player);
    const last = metrics.daily?.lastDateKey || null;
    let streak = metrics.daily?.streak || 0;
    if (last === dateKey) return;
    streak = last === previousDateKey(dateKey) ? streak + 1 : 1;
    await PlayerMetrics.updateOne({ playerKey: player.key }, {
        $set: { 'daily.streak': streak, 'daily.lastDateKey': dateKey },
        $inc: { 'daily.completed': 1 },
        $max: { 'daily.bestStreak': streak }
    });
    logger.event('daily_completed', { playerKey: player.key, dateKey, score: session.score, correct: session.correctCount, streak });
}

/** Public daily status for the entry screen. */
async function getDailyInfo(player) {
    const dateKey = dateKeyFor();
    const challenge = await DailyChallenge.findOne({ dateKey }).lean();
    let status = 'NOT_STARTED';
    let sessionId = null;
    let summary = null;
    let streak = 0;
    if (player) {
        const session = await GameSession.findOne({ playerKey: player.key, dailyDateKey: dateKey }).lean();
        if (session) {
            sessionId = String(session._id);
            status = session.status === 'ACTIVE' ? 'ACTIVE' : 'COMPLETED';
            if (status === 'COMPLETED') summary = { score: session.score, correct: session.correctCount, questionCount: session.questionCount, bestStreak: session.bestStreak };
        }
        const metrics = await metricsService.getMetrics(player.key);
        streak = metrics?.daily?.streak || 0;
        if (metrics?.daily?.lastDateKey && metrics.daily.lastDateKey !== dateKey && metrics.daily.lastDateKey !== previousDateKey(dateKey)) streak = 0;
    }
    const board = await leaderboardService.getBoard('DAILY', { periodKey: dateKey, limit: 10, playerKey: player?.key || null });
    return {
        dateKey,
        questionCount: challenge?.questionCount || config.daily.questionCount,
        status,
        sessionId,
        summary,
        dailyStreak: streak,
        stats: challenge ? { plays: challenge.stats.plays, completions: challenge.stats.completions, averageScore: challenge.stats.completions ? Math.round(challenge.stats.scoreTotal / challenge.stats.completions) : null } : { plays: 0, completions: 0, averageScore: null },
        leaderboard: board
    };
}

/** Audit view for internal tooling: the full spec list including answers. */
async function auditChallenge(dateKey) {
    const doc = await DailyChallenge.findOne({ dateKey }).select('+questionSpecs').lean();
    if (!doc) return null;
    const played = await QuestionInstance.countDocuments({ gameMode: 'DAILY_10', dailySpecIndex: { $ne: null }, createdAt: { $gte: new Date(`${dateKey}T00:00:00Z`), $lt: new Date(`${dateKey}T23:59:59.999Z`) } });
    return { ...doc, questionsServed: played };
}

module.exports = { dateKeyFor, seedFor, previousDateKey, generateChallenge, getOrCreateChallenge, questionSpecForIndex, startDaily, onDailyCompleted, getDailyInfo, auditChallenge };
