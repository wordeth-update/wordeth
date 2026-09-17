'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireDatabase } = require('../middleware/requireDatabase');
const { errorHandler } = require('../middleware/errorHandler');

/**
 * Mounts the Lyric IQ API under a parent path (server.js uses /api).
 *
 *   /game/*          gameplay sessions
 *   /daily/*         Daily 10
 *   /profile/*       player profile + Lyric IQ
 *   /leaderboards/*  boards
 *   /internal/*      content controls (protected)
 */
function createLyricIqRouter() {
    const router = express.Router();

    // Answers are the hot path; bound abuse without hurting Rapid Fire (≈1 answer/sec).
    const answerLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 240,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: { code: 'RATE_LIMITED', message: 'Slow down a little.' } },
        keyGenerator: (req) => req.header('X-Guest-Token') || req.header('Authorization') || req.ip
    });
    const sessionLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: { code: 'RATE_LIMITED', message: 'Too many new games. Give it a minute.' } },
        keyGenerator: (req) => req.header('X-Guest-Token') || req.header('Authorization') || req.ip
    });

    router.use(requireDatabase);
    router.use('/game/sessions/:id/answer', answerLimiter);
    router.post('/game/sessions', sessionLimiter);
    router.post('/daily/start', sessionLimiter);

    router.use('/game', require('./game'));
    router.use('/daily', require('./daily'));
    router.use('/profile', require('./profile'));
    router.use('/leaderboards', require('./leaderboards'));
    router.use('/internal', require('./internal'));

    router.use(errorHandler);
    return router;
}

module.exports = { createLyricIqRouter };
