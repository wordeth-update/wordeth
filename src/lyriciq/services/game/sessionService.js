'use strict';

const mongoose = require('mongoose');
const config = require('../../config');
const logger = require('../../utilities/logger');
const { badRequest, notFound, conflict, forbidden, unavailable } = require('../../utilities/errors');
const GameSession = require('../../models/GameSession');
const QuestionInstance = require('../../models/QuestionInstance');
const AnswerAttempt = require('../../models/AnswerAttempt');
const { QuestionEngine } = require('../../engines/question/QuestionEngine');
const catalogService = require('../content/catalogService');
const restrictionService = require('../content/restrictionService');
const featureFlags = require('../content/featureFlags');
const { getModeDefinition, isValidMode, planNextQuestion } = require('./gameModes');
const { evaluateAnswer } = require('./answerService');
const { scoreAnswer } = require('../scoring/scoringService');
const metricsService = require('../lyricIq/playerMetricsService');
const { refreshLyricIq, computeLyricIq } = require('../lyricIq/lyricIqService');
const leaderboardService = require('../leaderboard/leaderboardService');
const { buildSharePayload, buildShareCard } = require('../share/shareService');
const { secureRandom } = require('../../utilities/random');

let engine = null;
function getEngine() {
    if (!engine) engine = new QuestionEngine({ catalog: catalogService });
    return engine;
}
/** Test hook. */
function setEngine(e) { engine = e; }

/* ------------------------------------------------------------------ */
/* Session creation                                                    */
/* ------------------------------------------------------------------ */

async function createSession(player, { gameMode = 'QUICK_PLAY', category = null, challengeCode = null, artist = null } = {}) {
    if (!isValidMode(gameMode)) throw badRequest('INVALID_GAME_MODE', `Unknown game mode "${gameMode}"`);
    const flags = await featureFlags.getFlags();
    if (player.isGuest && flags.guestPlay === false) throw forbidden('GUEST_PLAY_DISABLED', 'Sign in to play.');
    const modeFlag = featureFlags.MODE_FLAGS[gameMode];
    if (modeFlag && flags[modeFlag] === false) throw forbidden('GAME_MODE_DISABLED', 'This mode is not available right now.');
    const restrictions = await restrictionService.getSnapshot();
    if (restrictions.gameModes.has(gameMode)) throw forbidden('GAME_MODE_DISABLED', 'This mode is not available right now.');

    if (gameMode === 'DAILY_10') {
        // Daily sessions are owned by the daily service (one per player per day).
        const dailyService = require('./dailyService');
        return dailyService.startDaily(player);
    }

    // Artist scope: resolve (and seed, first time) before anything is written, so a
    // thin artist fails cleanly with nothing abandoned.
    let artistScope = null;
    if (artist && (artist.providerArtistId || artist.key || artist.name)) {
        if (flags.artistChallenges === false) throw forbidden('FEATURE_DISABLED', 'Artist rounds are not available right now.');
        const resolved = await catalogService.ensureArtist({ providerArtistId: artist.providerArtistId || null, artistKey: artist.key || null, name: artist.name || null });
        if (!resolved || resolved.playable < config.catalog.minArtistTracks) {
            const rep = resolved?.report;
            const why = rep ? ` (${resolved.playable} usable; provider gave ${rep.id ?? '–'} by id, ${rep.name ?? '–'} by name${rep.errors.length ? '; ' + rep.errors.join(', ') : ''})` : '';
            throw unavailable('ARTIST_TOO_THIN', `Not enough songs with lyrics for ${resolved?.name || artist.name || 'that artist'} yet${why}. Try another artist.`);
        }
        artistScope = { key: resolved.artistKey, name: resolved.name, providerArtistId: resolved.providerArtistId };
    }

    const mode = getModeDefinition(gameMode);
    const now = new Date();
    // Any other in-flight session for this player is abandoned; one active game at a time.
    await GameSession.updateMany({ playerKey: player.key, status: 'ACTIVE', dailyDateKey: null }, { $set: { status: 'ABANDONED', endedAt: now, endReason: 'NEW_SESSION' } });

    const before = await currentLyricIq(player.key);
    const session = await GameSession.create({
        playerKey: player.key,
        userId: player.userId || null,
        guestId: player.guestId || null,
        gameMode,
        category: category && category !== 'all' ? category : null,
        artist: artistScope,
        questionCount: mode.questionCount,
        deadlineAt: mode.timeLimitMs ? new Date(now.getTime() + mode.timeLimitMs) : null,
        scoreModelVersion: config.scoring.modelVersion,
        lyricIqBefore: before,
        referral: { challengeCode: challengeCode || null }
    });
    logger.event('session_started', { sessionId: String(session._id), playerKey: player.key, gameMode, category: session.category, artistKey: artistScope?.key || null, guest: player.isGuest });
    const question = await serveNextQuestion(session, player, flags);
    return { session, question };
}

async function currentLyricIq(playerKey) {
    const metrics = await metricsService.getMetrics(playerKey);
    return metrics ? computeLyricIq(metrics).value : null;
}

/* ------------------------------------------------------------------ */
/* Question serving                                                    */
/* ------------------------------------------------------------------ */

async function loadOwnedSession(sessionId, player) {
    if (!mongoose.isValidObjectId(sessionId)) throw notFound('SESSION_NOT_FOUND', 'Session not found');
    const session = await GameSession.findById(sessionId);
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Session not found');
    if (session.playerKey !== player.key) throw forbidden('SESSION_FORBIDDEN', 'This session belongs to another player');
    return session;
}

function isPastDeadline(session, now = new Date()) {
    return session.deadlineAt && session.deadlineAt <= now;
}

/** Return the current pending question, generating the next one when needed. */
async function getCurrentQuestion(sessionId, player) {
    const session = await loadOwnedSession(sessionId, player);
    if (session.status !== 'ACTIVE') throw conflict('SESSION_NOT_ACTIVE', `Session is ${session.status.toLowerCase()}`, { status: session.status });
    if (isPastDeadline(session)) {
        await completeSession(session, player, 'TIME_UP');
        throw conflict('SESSION_NOT_ACTIVE', 'Time is up', { status: 'COMPLETED' });
    }
    const pending = await QuestionInstance.findOne({ sessionId: session._id, status: 'PENDING' }).sort({ index: -1 });
    if (pending) {
        if (pending.expiresAt > new Date()) return { session, question: pending };
        // Stale question: retire it (no penalty, kept for audit) and serve a replacement.
        // Question indexes stay monotonic; progress shown to players is derived from answers.
        await QuestionInstance.updateOne({ _id: pending._id, status: 'PENDING' }, { $set: { status: 'EXPIRED' } });
    }
    const flags = await featureFlags.getFlags();
    const question = await serveNextQuestion(session, player, flags);
    return { session, question };
}

/**
 * Generate + persist the next question for a session. Daily sessions
 * instantiate from the canonical spec; everything else uses the engine.
 */
async function serveNextQuestion(session, player, flags = null) {
    const answered = session.correctCount + session.wrongCount;
    if (answered >= session.questionCount) return null;
    const index = session.questionsServed;
    const now = new Date();
    let spec;

    if (session.dailyDateKey) {
        const dailyService = require('./dailyService');
        spec = await dailyService.questionSpecForIndex(session.dailyDateKey, index);
        if (!spec) throw unavailable('NO_ELIGIBLE_QUESTIONS', 'Today\'s challenge is not available right now.');
        spec = { ...spec, generation: { attempts: 1, rejectedReasons: [], source: 'daily' }, dailySpecIndex: index };
    } else {
        const f = flags || await featureFlags.getFlags();
        const plan = planNextQuestion({ gameMode: session.gameMode, questionIndex: index, currentStreak: session.currentStreak, typedAnswersEnabled: f.typedAnswers !== false, rng: secureRandom });
        const artistKey = session.artist?.key || null;
        // Every song in an artist round is by the same artist, so "who sang this" is no question at all.
        if (artistKey && plan.template === 'GUESS_THE_ARTIST') plan.template = 'GUESS_THE_SONG';
        spec = await getEngine().generate({
            gameMode: session.gameMode,
            artistKey,
            template: plan.template,
            answerType: plan.answerType,
            targetDifficulty: plan.targetDifficulty,
            genre: session.category,
            excludeTrackIds: session.usedTrackIds
        });
        if (!spec && artistKey) {
            // A short catalogue runs out of fresh songs before the round ends: a song
            // comes back with a different line rather than the round dying early.
            spec = await getEngine().generate({ gameMode: session.gameMode, artistKey, template: plan.template, answerType: plan.answerType, targetDifficulty: plan.targetDifficulty, genre: session.category, excludeTrackIds: session.usedTrackIds.slice(-1) });
        }
        if (!spec) throw unavailable('NO_ELIGIBLE_QUESTIONS', 'No playable questions are available right now. Please try again shortly.');
    }

    const expiresAt = session.deadlineAt
        ? new Date(Math.min(session.deadlineAt.getTime(), now.getTime() + config.session.questionTtlMs))
        : new Date(now.getTime() + config.session.questionTtlMs);

    const question = await QuestionInstance.create({
        ...spec,
        sessionId: session._id,
        playerKey: session.playerKey,
        index,
        gameMode: session.gameMode,
        servedAt: now,
        expiresAt
    });
    session.questionsServed = index + 1;
    session.questionIds.push(question._id);
    session.usedTrackIds.push(question.trackId);
    session.lastActivityAt = now;
    await session.save();
    return question;
}

/**
 * The client reports the moment a pre-generated question hit the screen. Accepted
 * once per question and only within a short grace window after generation, so a
 * slow "shown" cannot buy unlimited reading time.
 */
async function markQuestionShown(sessionId, player, questionId) {
    const session = await loadOwnedSession(sessionId, player);
    if (!mongoose.isValidObjectId(questionId)) throw badRequest('INVALID_QUESTION', 'questionId is required');
    const question = await QuestionInstance.findOne({ _id: questionId, sessionId: session._id }).select('servedAt shownAt status').lean();
    if (!question) throw notFound('QUESTION_NOT_FOUND', 'Question not found in this session');
    if (question.status !== 'PENDING' || question.shownAt) return { ok: true, changed: false };
    const now = Date.now();
    const shownAt = new Date(Math.min(now, question.servedAt.getTime() + config.session.shownGraceMs));
    const r = await QuestionInstance.updateOne({ _id: question._id, status: 'PENDING', shownAt: null }, { $set: { shownAt } });
    return { ok: true, changed: r.modifiedCount > 0 };
}

/* ------------------------------------------------------------------ */
/* Answer submission                                                   */
/* ------------------------------------------------------------------ */

async function submitAnswer(sessionId, player, { questionId, answer, choiceIndex } = {}) {
    const session = await loadOwnedSession(sessionId, player);
    if (session.status !== 'ACTIVE') throw conflict('SESSION_NOT_ACTIVE', `Session is ${session.status.toLowerCase()}`, { status: session.status });
    const now = new Date();
    if (isPastDeadline(session, now)) {
        const results = await completeSession(session, player, 'TIME_UP');
        return { sessionCompleted: true, timedOut: true, results, session: session.toPublic() };
    }
    if (!mongoose.isValidObjectId(questionId)) throw badRequest('INVALID_QUESTION', 'questionId is required');

    // Atomic claim: exactly one submission can move PENDING → ANSWERED.
    const question = await QuestionInstance.findOneAndUpdate(
        { _id: questionId, sessionId: session._id, status: 'PENDING' },
        { $set: { status: 'ANSWERED', answeredAt: now } },
        { new: true }
    ).select('+answerKey');
    if (!question) {
        const existing = await QuestionInstance.findOne({ _id: questionId, sessionId: session._id }).lean();
        if (!existing) throw notFound('QUESTION_NOT_FOUND', 'Question not found in this session');
        throw conflict('QUESTION_ALREADY_ANSWERED', 'This question has already been answered', { status: existing.status });
    }

    // Questions are generated during the previous answer's round trip, so time the
    // player from when the client showed it (bounded), not from generation.
    const startedAt = question.shownAt && question.shownAt > question.servedAt ? question.shownAt : question.servedAt;
    const responseTimeMs = Math.max(0, now.getTime() - startedAt.getTime());
    const evaluation = evaluateAnswer({ answerType: question.answerType, answerKey: question.answerKey, choices: question.choices }, { answer, choiceIndex });
    const streakBefore = session.currentStreak;
    const scoring = scoreAnswer({ correct: evaluation.correct, difficulty: question.difficulty, responseTimeMs, streakBefore, answerType: question.answerType });

    const attempt = await AnswerAttempt.create({
        sessionId: session._id,
        questionId: question._id,
        playerKey: player.key,
        gameMode: session.gameMode,
        template: question.template,
        skill: question.skill,
        answerType: question.answerType,
        normalizedInput: evaluation.normalizedInput,
        choiceIndex: evaluation.choiceIndex,
        correct: evaluation.correct,
        pointsAwarded: scoring.points,
        responseTimeMs,
        difficulty: question.difficulty,
        difficultyBand: question.difficultyBand,
        streakAtAnswer: streakBefore,
        trackDimensions: { trackId: question.trackId, artistKey: question.trackPublic?.artistKey || slugArtist(question.trackPublic?.artist), genre: question.trackPublic?.genre || null, decade: question.trackPublic?.decade || null },
        scoreModelVersion: scoring.modelVersion
    });

    // Session aggregates
    session.correctCount += evaluation.correct ? 1 : 0;
    session.wrongCount += evaluation.correct ? 0 : 1;
    session.score += scoring.points;
    session.totalResponseMs += responseTimeMs;
    session.currentStreak = evaluation.correct ? streakBefore + 1 : 0;
    session.bestStreak = Math.max(session.bestStreak, session.currentStreak);
    session.difficultyDistribution[question.difficultyBand] = (session.difficultyDistribution[question.difficultyBand] || 0) + 1;
    session.lastActivityAt = now;
    await session.save();

    await metricsService.recordAnswer(player, attempt);
    logger.event('question_answered', { sessionId: String(session._id), questionId: String(question._id), correct: evaluation.correct, points: scoring.points, responseTimeMs, difficulty: question.difficulty, template: question.template, answerType: question.answerType, gameMode: session.gameMode, streak: session.currentStreak });

    const mode = getModeDefinition(session.gameMode);
    const answered = session.correctCount + session.wrongCount;
    let endReason = null;
    if (mode.endOnWrong && !evaluation.correct) endReason = 'STREAK_BROKEN';
    else if (answered >= session.questionCount) endReason = 'COMPLETED';

    const response = {
        correct: evaluation.correct,
        canonicalAnswer: evaluation.canonicalAnswer,
        normalizedInput: evaluation.normalizedInput,
        choiceIndex: evaluation.choiceIndex,
        correctChoiceIndex: question.answerType === 'MULTIPLE_CHOICE' ? question.answerKey.choiceIndex : null,
        pointsAwarded: scoring.points,
        responseTimeMs,
        scoreBreakdown: scoring.breakdown,
        streak: session.currentStreak,
        track: question.trackPublic,
        session: session.toPublic(),
        sessionCompleted: false,
        nextQuestion: null,
        results: null
    };

    if (endReason) {
        response.sessionCompleted = true;
        response.results = await completeSession(session, player, endReason);
        response.session = session.toPublic();
    } else {
        const next = await serveNextQuestion(session, player);
        response.nextQuestion = next ? next.toPublic() : null;
        response.session = session.toPublic();
    }
    return response;
}

function slugArtist(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || null;
}

/* ------------------------------------------------------------------ */
/* Completion + results                                                */
/* ------------------------------------------------------------------ */

async function completeSession(session, player, endReason = 'COMPLETED') {
    if (session.status === 'ACTIVE') {
        session.status = 'COMPLETED';
        session.endedAt = new Date();
        session.endReason = endReason;
        await QuestionInstance.updateMany({ sessionId: session._id, status: 'PENDING' }, { $set: { status: 'EXPIRED' } });
        await metricsService.recordSessionComplete(player, session);
        if (session.dailyDateKey) {
            const dailyService = require('./dailyService');
            await dailyService.onDailyCompleted(player, session);
        }
        const lyricIq = await refreshLyricIq(player.key);
        session.lyricIqAfter = lyricIq.value;
        const metricsNow = await metricsService.getMetrics(player.key);
        session.shareCard = buildShareCard({ lyricIq, session, displayName: player.displayName, isGuest: !!player.isGuest, dailyStreak: metricsNow?.daily?.streak || 0 });
        await session.save();
        await leaderboardService.recordSessionResult(player, session, lyricIq.value, lyricIq);
        logger.event('session_completed', { sessionId: String(session._id), playerKey: player.key, gameMode: session.gameMode, score: session.score, correct: session.correctCount, wrong: session.wrongCount, bestStreak: session.bestStreak, endReason, lyricIq: lyricIq.value });
    }
    return buildResults(session, player);
}

async function buildResults(session, player) {
    const [metrics, attempts, questions] = await Promise.all([
        metricsService.getMetrics(player.key),
        AnswerAttempt.find({ sessionId: session._id }).sort({ createdAt: 1 }).lean(),
        QuestionInstance.find({ sessionId: session._id }).sort({ index: 1 }).lean()
    ]);
    const lyricIq = computeLyricIq(metrics);
    const byQuestion = new Map(questions.map((q) => [String(q._id), q]));
    const breakdown = attempts.map((a) => {
        const q = byQuestion.get(String(a.questionId)) || {};
        return {
            index: q.index,
            template: a.template,
            answerType: a.answerType,
            correct: a.correct,
            points: a.pointsAwarded,
            responseTimeMs: a.responseTimeMs,
            difficulty: a.difficulty,
            difficultyBand: a.difficultyBand,
            track: q.trackPublic || null
        };
    });
    const dailyStreak = metrics?.daily?.streak || 0;
    return {
        session: session.toPublic(),
        lyricIq: {
            before: session.lyricIqBefore,
            after: lyricIq.value,
            delta: session.lyricIqBefore !== null && lyricIq.value !== null ? lyricIq.value - session.lyricIqBefore : null,
            provisional: lyricIq.provisional,
            sampleSize: lyricIq.sampleSize,
            components: lyricIq.components,
            subScores: lyricIq.subScores,
            thresholds: lyricIq.thresholds
        },
        breakdown,
        dailyStreak,
        share: buildSharePayload({ lyricIq, session, displayName: player.displayName, dailyStreak, challengeUrl: `${config.publicUrl}/?challenge=${session._id}` }),
        isGuest: !!player.isGuest
    };
}

async function getResults(sessionId, player) {
    const session = await loadOwnedSession(sessionId, player);
    if (session.status === 'ACTIVE' && isPastDeadline(session)) {
        return completeSession(session, player, 'TIME_UP');
    }
    // Asking for results on a live session is the player ending it early (the End button):
    // close it out so the run counts, the leaderboard sees it and the share card exists.
    if (session.status === 'ACTIVE') {
        return completeSession(session, player, 'ENDED_EARLY');
    }
    return buildResults(session, player);
}

async function abandonSession(sessionId, player) {
    const session = await loadOwnedSession(sessionId, player);
    if (session.status === 'ACTIVE') {
        session.status = 'ABANDONED';
        session.endedAt = new Date();
        session.endReason = 'ABANDONED';
        await session.save();
        await QuestionInstance.updateMany({ sessionId: session._id, status: 'PENDING' }, { $set: { status: 'EXPIRED' } });
    }
    return session;
}

/** Sweep idle ACTIVE sessions into EXPIRED. Safe to run on an interval. */
async function expireStaleSessions(now = new Date()) {
    const cutoff = new Date(now.getTime() - config.session.idleExpiryMs);
    const result = await GameSession.updateMany(
        { status: 'ACTIVE', lastActivityAt: { $lt: cutoff } },
        { $set: { status: 'EXPIRED', endedAt: now, endReason: 'IDLE' } }
    );
    const count = result.modifiedCount || 0;
    if (count) logger.info('sessions_expired', { count });
    return count;
}

/* ------------------------------------------------------------------ */
/* Guest → user migration                                              */
/* ------------------------------------------------------------------ */

async function claimGuest(user, guestId) {
    if (!user || !guestId) throw badRequest('INVALID_GUEST_TOKEN', 'Guest token is invalid or expired');
    const guestKey = `guest:${guestId}`;
    const userKey = `user:${user._id}`;
    const filter = { playerKey: guestKey };
    const set = { $set: { playerKey: userKey, userId: user._id, guestId: null } };
    // Daily uniqueness: if the user already played a day the guest also played, drop the guest copy.
    const userDailyDays = await GameSession.distinct('dailyDateKey', { playerKey: userKey, dailyDateKey: { $ne: null } });
    if (userDailyDays.length) {
        const clash = await GameSession.find({ playerKey: guestKey, dailyDateKey: { $in: userDailyDays } }).select('_id').lean();
        const ids = clash.map((c) => c._id);
        if (ids.length) {
            await Promise.all([
                GameSession.deleteMany({ _id: { $in: ids } }),
                QuestionInstance.deleteMany({ sessionId: { $in: ids } }),
                AnswerAttempt.deleteMany({ sessionId: { $in: ids } })
            ]);
        }
    }
    const [sessions] = await Promise.all([
        GameSession.updateMany(filter, set),
        QuestionInstance.updateMany(filter, { $set: { playerKey: userKey } }),
        AnswerAttempt.updateMany(filter, { $set: { playerKey: userKey } })
    ]);
    await metricsService.mergeGuestIntoUser(guestKey, user);
    const lyricIq = await refreshLyricIq(userKey);
    await leaderboardService.migrateGuest(guestKey, user, lyricIq.value);
    logger.event('guest_claimed', { userId: String(user._id), sessionsMigrated: sessions.modifiedCount || 0 });
    return { sessionsMigrated: sessions.modifiedCount || 0, lyricIq };
}

module.exports = {
    createSession,
    getCurrentQuestion,
    markQuestionShown,
    serveNextQuestion,
    submitAnswer,
    completeSession,
    getResults,
    abandonSession,
    expireStaleSessions,
    claimGuest,
    loadOwnedSession,
    getEngine,
    setEngine
};
