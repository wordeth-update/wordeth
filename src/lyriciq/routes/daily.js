'use strict';

const express = require('express');
const { playerIdentity } = require('../middleware/playerIdentity');
const { asyncHandler } = require('../middleware/errorHandler');
const { forbidden } = require('../utilities/errors');
const dailyService = require('../services/game/dailyService');
const sessionService = require('../services/game/sessionService');
const featureFlags = require('../services/content/featureFlags');

const router = express.Router();

async function assertEnabled() {
    if (!(await featureFlags.isEnabled('dailyChallenge'))) throw forbidden('GAME_MODE_DISABLED', 'The Daily 10 is not available right now.');
}

router.get('/', playerIdentity({ required: false }), asyncHandler(async (req, res) => {
    await assertEnabled();
    res.json(await dailyService.getDailyInfo(req.player));
}));

router.post('/start', playerIdentity({ createGuest: true }), asyncHandler(async (req, res) => {
    await assertEnabled();
    const { session, question, resumed } = await sessionService.createSession(req.player, { gameMode: 'DAILY_10' });
    const payload = { session: session.toPublic(), question: question ? question.toPublic() : null, resumed: !!resumed, player: { key: req.player.key, isGuest: req.player.isGuest, displayName: req.player.displayName } };
    if (req.player.newGuestToken) payload.guestToken = req.player.newGuestToken;
    res.status(resumed ? 200 : 201).json(payload);
}));

module.exports = router;
