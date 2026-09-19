'use strict';

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { playerIdentity, verifyGuestToken } = require('../middleware/playerIdentity');
const { asyncHandler } = require('../middleware/errorHandler');
const { badRequest, forbidden } = require('../utilities/errors');
const GameSession = require('../models/GameSession');
const metricsService = require('../services/lyricIq/playerMetricsService');
const { computeLyricIq, explainLyricIq } = require('../services/lyricIq/lyricIqService');
const sessionService = require('../services/game/sessionService');
const { buildSharePayload } = require('../services/share/shareService');
const User = require('../../../models/User');

const router = express.Router();

function summarizeMetrics(metrics) {
    if (!metrics) return null;
    const m = metrics;
    const flat = (map) => Object.fromEntries(Object.entries(map || {}).map(([k, b]) => [k, { attempts: b.attempts, accuracy: b.attempts ? Number((b.correct / b.attempts).toFixed(3)) : 0, avgDifficulty: b.attempts ? Math.round(b.sumDifficulty / b.attempts) : 0, avgResponseMs: b.attempts ? Math.round(b.sumResponseMs / b.attempts) : 0 }]));
    return {
        totals: {
            attempts: m.totals.attempts,
            correct: m.totals.correct,
            accuracy: m.totals.attempts ? Number((m.totals.correct / m.totals.attempts).toFixed(3)) : 0,
            avgResponseMs: m.totals.attempts ? Math.round(m.totals.sumResponseMs / m.totals.attempts) : 0,
            recall: { attempts: m.totals.recallAttempts, correct: m.totals.recallCorrect },
            recognition: { attempts: m.totals.recognitionAttempts, correct: m.totals.recognitionCorrect },
            typed: { attempts: m.totals.typedAttempts, correct: m.totals.typedCorrect }
        },
        byGenre: flat(m.byGenre),
        byDecade: flat(m.byDecade),
        byMode: flat(m.byMode),
        byTemplate: flat(m.byTemplate),
        byArtist: flat(m.byArtist),
        artistsPlayed: Object.keys(m.byArtist || {}).length,
        sessionsCompleted: m.sessionsCompleted,
        bestStreak: m.bestStreak,
        bestSessionScore: m.bestSessionScore,
        totalScore: m.totalScore,
        daily: m.daily
    };
}

router.get('/me', playerIdentity(), asyncHandler(async (req, res) => {
    const metrics = await metricsService.getMetrics(req.player.key);
    const lyricIq = computeLyricIq(metrics);
    const recent = await GameSession.find({ playerKey: req.player.key, status: 'COMPLETED' }).sort({ endedAt: -1 }).limit(10).lean();
    res.json({
        player: { key: req.player.key, isGuest: req.player.isGuest, displayName: req.player.displayName },
        lyricIq,
        explanation: explainLyricIq(lyricIq),
        metrics: summarizeMetrics(metrics),
        recentSessions: recent.map((s) => ({ id: String(s._id), gameMode: s.gameMode, score: s.score, correct: s.correctCount, wrong: s.wrongCount, bestStreak: s.bestStreak, endedAt: s.endedAt, dailyDateKey: s.dailyDateKey })),
        share: buildSharePayload({ lyricIq, displayName: req.player.displayName, dailyStreak: metrics?.daily?.streak || 0 })
    });
}));

router.get('/me/lyric-iq', playerIdentity(), asyncHandler(async (req, res) => {
    const metrics = await metricsService.getMetrics(req.player.key);
    const lyricIq = computeLyricIq(metrics);
    res.json({ lyricIq, explanation: explainLyricIq(lyricIq) });
}));

/** Guest → user migration: called after sign-in/sign-up with the guest token. */
router.post('/claim-guest',
    playerIdentity(),
    validate([body('guestToken').isString().isLength({ min: 10, max: 2000 })]),
    asyncHandler(async (req, res) => {
        if (req.player.isGuest) throw forbidden('SIGN_IN_REQUIRED', 'Sign in to save your Lyric IQ.');
        const guestId = verifyGuestToken(req.body.guestToken);
        if (!guestId) throw badRequest('INVALID_GUEST_TOKEN', 'Guest token is invalid or expired');
        const user = await User.findById(req.player.userId).select('name');
        const result = await sessionService.claimGuest(user, guestId);
        res.json(result);
    })
);

module.exports = router;
