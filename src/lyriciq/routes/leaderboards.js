'use strict';

const express = require('express');
const { query } = require('express-validator');
const { validate } = require('../middleware/validate');
const { playerIdentity } = require('../middleware/playerIdentity');
const { asyncHandler } = require('../middleware/errorHandler');
const { forbidden } = require('../utilities/errors');
const leaderboardService = require('../services/leaderboard/leaderboardService');
const featureFlags = require('../services/content/featureFlags');

const router = express.Router();

const boardRoute = (board) => [
    playerIdentity({ required: false }),
    ...validate([
        query('period').optional().isString().isLength({ max: 12 }).matches(/^[0-9A-Za-z-]+$/),
        query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
    ]),
    asyncHandler(async (req, res) => {
        if (!(await featureFlags.isEnabled('leaderboards'))) throw forbidden('FEATURE_DISABLED', 'Leaderboards are not available right now.');
        res.json(await leaderboardService.getBoard(board, { periodKey: req.query.period, limit: req.query.limit, playerKey: req.player?.key || null }));
    })
];

router.get('/daily', ...boardRoute('DAILY'));
router.get('/weekly', ...boardRoute('WEEKLY'));
router.get('/all-time', ...boardRoute('ALL_TIME'));

module.exports = router;
