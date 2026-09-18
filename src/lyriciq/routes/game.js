'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { playerIdentity } = require('../middleware/playerIdentity');
const { asyncHandler } = require('../middleware/errorHandler');
const sessionService = require('../services/game/sessionService');
const featureFlags = require('../services/content/featureFlags');
const catalogService = require('../services/content/catalogService');

const router = express.Router();

const MODES = Object.keys(config.modes);

/** Public game configuration for the entry screen. */
router.get('/config', playerIdentity({ required: false }), asyncHandler(async (req, res) => {
    const [flags, categories] = await Promise.all([featureFlags.getFlags(), catalogService.listCategories()]);
    res.json({
        modes: MODES.filter((m) => {
            const flag = featureFlags.MODE_FLAGS[m];
            return !flag || flags[flag] !== false;
        }).map((m) => ({ key: m, ...config.modes[m] })),
        categories,
        flags: { typedAnswers: flags.typedAnswers !== false, guestPlay: flags.guestPlay !== false, leaderboards: flags.leaderboards !== false, shareCards: flags.shareCards !== false, lyricIQ: flags.lyricIQ !== false },
        player: req.player ? { key: req.player.key, isGuest: req.player.isGuest, displayName: req.player.displayName } : null,
        synthetic: config.provider.name === 'synthetic'
    });
}));

function withGuestToken(req, payload) {
    if (req.player && req.player.newGuestToken) payload.guestToken = req.player.newGuestToken;
    payload.player = { key: req.player.key, isGuest: req.player.isGuest, displayName: req.player.displayName };
    return payload;
}

router.post('/sessions',
    playerIdentity({ createGuest: true }),
    validate([
        body('gameMode').optional().isString().isIn(MODES).withMessage(`gameMode must be one of ${MODES.join(', ')}`),
        body('category').optional({ nullable: true }).isString().isLength({ max: 40 }).matches(/^[a-z0-9-]+$/i),
        body('challengeCode').optional({ nullable: true }).isString().isLength({ max: 64 })
    ]),
    asyncHandler(async (req, res) => {
        const { session, question, resumed } = await sessionService.createSession(req.player, {
            gameMode: req.body.gameMode || 'QUICK_PLAY',
            category: req.body.category || null,
            challengeCode: req.body.challengeCode || null
        });
        res.status(resumed ? 200 : 201).json(withGuestToken(req, {
            session: session.toPublic(),
            question: question ? question.toPublic() : null,
            resumed: !!resumed
        }));
    })
);

router.get('/sessions/:id/question',
    playerIdentity(),
    validate([param('id').isMongoId()]),
    asyncHandler(async (req, res) => {
        const { session, question } = await sessionService.getCurrentQuestion(req.params.id, req.player);
        res.json({ session: session.toPublic(), question: question ? question.toPublic() : null });
    })
);

router.post('/sessions/:id/questions/:qid/shown',
    playerIdentity(),
    validate([param('id').isMongoId(), param('qid').isMongoId()]),
    asyncHandler(async (req, res) => {
        res.json(await sessionService.markQuestionShown(req.params.id, req.player, req.params.qid));
    })
);

router.post('/sessions/:id/answer',
    playerIdentity(),
    validate([
        param('id').isMongoId(),
        body('questionId').isMongoId().withMessage('questionId is required'),
        body('answer').optional({ nullable: true }).isString().isLength({ max: config.answers.maxAnswerLength }),
        body('choiceIndex').optional({ nullable: true }).isInt({ min: 0, max: 10 }).toInt()
    ]),
    asyncHandler(async (req, res) => {
        const result = await sessionService.submitAnswer(req.params.id, req.player, {
            questionId: req.body.questionId,
            answer: req.body.answer,
            choiceIndex: req.body.choiceIndex
        });
        res.json(result);
    })
);

router.get('/sessions/:id/results',
    playerIdentity(),
    validate([param('id').isMongoId()]),
    asyncHandler(async (req, res) => {
        res.json(await sessionService.getResults(req.params.id, req.player));
    })
);

router.post('/sessions/:id/abandon',
    playerIdentity(),
    validate([param('id').isMongoId()]),
    asyncHandler(async (req, res) => {
        const session = await sessionService.abandonSession(req.params.id, req.player);
        res.json({ session: session.toPublic() });
    })
);

module.exports = router;
