'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { playerIdentity } = require('../middleware/playerIdentity');
const { asyncHandler } = require('../middleware/errorHandler');
const sessionService = require('../services/game/sessionService');
const featureFlags = require('../services/content/featureFlags');
const catalogService = require('../services/content/catalogService');
const { forbidden } = require('../utilities/errors');

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
        flags: { typedAnswers: flags.typedAnswers !== false, guestPlay: flags.guestPlay !== false, leaderboards: flags.leaderboards !== false, shareCards: flags.shareCards !== false, lyricIQ: flags.lyricIQ !== false, artistChallenges: flags.artistChallenges !== false },
        player: req.player ? { key: req.player.key, isGuest: req.player.isGuest, displayName: req.player.displayName } : null,
        synthetic: config.provider.name === 'synthetic'
    });
}));

function withGuestToken(req, payload) {
    if (req.player && req.player.newGuestToken) payload.guestToken = req.player.newGuestToken;
    payload.player = { key: req.player.key, isGuest: req.player.isGuest, displayName: req.player.displayName };
    return payload;
}

/** Artist picker for the setup screen: what the catalogue holds plus what the provider knows. */
router.get('/artists',
    playerIdentity({ required: false }),
    validate([query('q').isString().trim().isLength({ min: 2, max: 60 })]),
    asyncHandler(async (req, res) => {
        if (!(await featureFlags.isEnabled('artistChallenges'))) throw forbidden('FEATURE_DISABLED', 'Artist rounds are not available right now.');
        const artists = await catalogService.searchArtists({ query: req.query.q, limit: 10 });
        res.json({ artists: artists.map((a) => ({ key: a.artistKey, name: a.name, providerArtistId: a.providerArtistId, tracks: a.tracks, ready: a.tracks >= config.catalog.minArtistTracks })) });
    })
);

router.post('/sessions',
    playerIdentity({ createGuest: true }),
    validate([
        body('gameMode').optional().isString().isIn(MODES).withMessage(`gameMode must be one of ${MODES.join(', ')}`),
        body('category').optional({ nullable: true }).isString().isLength({ max: 40 }).matches(/^[a-z0-9-]+$/i),
        body('challengeCode').optional({ nullable: true }).isString().isLength({ max: 64 }),
        body('artist').optional({ nullable: true }).isObject(),
        body('artist.key').optional({ nullable: true }).isString().isLength({ max: 80 }).matches(/^[a-z0-9-]+$/),
        body('artist.name').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
        body('artist.providerArtistId').optional({ nullable: true }).isString().isLength({ max: 40 }).matches(/^[A-Za-z0-9_-]+$/)
    ]),
    asyncHandler(async (req, res) => {
        const a = req.body.artist;
        const artist = a && (a.key || a.providerArtistId || a.name) ? { key: a.key || null, name: a.name || null, providerArtistId: a.providerArtistId || null } : null;
        const { session, question, resumed } = await sessionService.createSession(req.player, {
            gameMode: req.body.gameMode || 'QUICK_PLAY',
            category: req.body.category || null,
            challengeCode: req.body.challengeCode || null,
            artist
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
