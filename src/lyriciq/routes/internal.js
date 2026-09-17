'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const { internalAuth } = require('../middleware/internalAuth');
const { asyncHandler } = require('../middleware/errorHandler');
const { notFound, badRequest } = require('../utilities/errors');
const Track = require('../models/Track');
const QuestionInstance = require('../models/QuestionInstance');
const ContentRestriction = require('../models/ContentRestriction');
const catalogService = require('../services/content/catalogService');
const restrictionService = require('../services/content/restrictionService');
const featureFlags = require('../services/content/featureFlags');
const dailyService = require('../services/game/dailyService');
const sessionService = require('../services/game/sessionService');
const config = require('../config');

const router = express.Router();
router.use(internalAuth);

const actor = (req) => req.internalActor || 'internal';

router.post('/tracks/:id/disable', validate([param('id').isMongoId(), body('reason').optional().isString().isLength({ max: 500 })]), asyncHandler(async (req, res) => {
    const track = await catalogService.setTrackStatus(req.params.id, 'DISABLED', req.body.reason || 'manual');
    if (!track) throw notFound('TRACK_NOT_FOUND');
    await restrictionService.addRestriction({ type: 'TRACK', value: req.params.id, reason: req.body.reason || 'manual', createdBy: actor(req) });
    res.json({ track: track.toPublicMetadata(), status: track.status });
}));

router.post('/tracks/:id/enable', validate([param('id').isMongoId()]), asyncHandler(async (req, res) => {
    const track = await catalogService.setTrackStatus(req.params.id, 'ACTIVE');
    if (!track) throw notFound('TRACK_NOT_FOUND');
    await restrictionService.removeRestriction({ type: 'TRACK', value: req.params.id });
    res.json({ track: track.toPublicMetadata(), status: track.status });
}));

/** :id is the artistKey slug (e.g. vera-solace) or a provider artist id. */
router.post('/artists/:id/disable', validate([param('id').isString().isLength({ min: 1, max: 120 }), body('reason').optional().isString().isLength({ max: 500 }), body('gameModes').optional().isArray()]), asyncHandler(async (req, res) => {
    const key = req.params.id;
    const doc = await restrictionService.addRestriction({ type: 'ARTIST', value: key, gameModes: req.body.gameModes || [], reason: req.body.reason || 'manual', createdBy: actor(req) });
    catalogService.invalidateTracks();
    const affected = await Track.countDocuments({ $or: [{ artistKey: key }, { providerArtistId: key }] });
    res.json({ restriction: doc, affectedTracks: affected });
}));

router.post('/artists/:id/enable', validate([param('id').isString().isLength({ min: 1, max: 120 })]), asyncHandler(async (req, res) => {
    const doc = await restrictionService.removeRestriction({ type: 'ARTIST', value: req.params.id });
    catalogService.invalidateTracks();
    res.json({ restriction: doc });
}));

/** Reject a served question: it is retired and its track is excluded from future generation. */
router.post('/questions/:id/reject', validate([param('id').isMongoId(), body('reason').optional().isString().isLength({ max: 500 }), body('disableTrack').optional().isBoolean().toBoolean()]), asyncHandler(async (req, res) => {
    const question = await QuestionInstance.findById(req.params.id);
    if (!question) throw notFound('QUESTION_NOT_FOUND');
    if (question.status === 'PENDING') question.status = 'REJECTED';
    question.generation.rejectedReasons.push(`manual:${req.body.reason || 'rejected'}`);
    await question.save();
    let track = null;
    if (req.body.disableTrack) {
        track = await catalogService.setTrackStatus(question.trackId, 'DISABLED', `question rejected: ${req.body.reason || ''}`);
    }
    res.json({ question: question.toPublic(), status: question.status, trackDisabled: !!track });
}));

/** Generic restriction management. */
router.get('/restrictions', asyncHandler(async (req, res) => {
    res.json({ restrictions: await ContentRestriction.find({}).sort({ createdAt: -1 }).limit(500).lean() });
}));

router.post('/restrictions', validate([
    body('type').isIn(['TRACK', 'ARTIST', 'ALBUM', 'PROVIDER', 'TERRITORY', 'GAME_MODE', 'EXPLICIT']),
    body('value').isString().isLength({ min: 1, max: 200 }),
    body('gameModes').optional().isArray(),
    body('reason').optional().isString().isLength({ max: 500 })
]), asyncHandler(async (req, res) => {
    const doc = await restrictionService.addRestriction({ ...req.body, createdBy: actor(req) });
    catalogService.invalidateTracks();
    res.status(201).json({ restriction: doc });
}));

router.delete('/restrictions', validate([body('type').isString(), body('value').isString()]), asyncHandler(async (req, res) => {
    const doc = await restrictionService.removeRestriction(req.body);
    catalogService.invalidateTracks();
    res.json({ restriction: doc });
}));

/** Feature flags. */
router.get('/flags', asyncHandler(async (req, res) => res.json({ flags: await featureFlags.getFlags() })));
router.put('/flags/:key', validate([param('key').isString().matches(/^[a-zA-Z]+$/), body('enabled').isBoolean().toBoolean()]), asyncHandler(async (req, res) => {
    if (!(req.params.key in config.featureFlags.defaults)) throw badRequest('UNKNOWN_FLAG', `Unknown flag ${req.params.key}`);
    const doc = await featureFlags.setFlag(req.params.key, req.body.enabled, { updatedBy: actor(req) });
    res.json({ flag: doc, flags: await featureFlags.getFlags() });
}));

/** Catalog operations. */
router.post('/catalog/seed', validate([body('queries').optional().isArray({ max: 50 }), body('pages').optional().isInt({ min: 1, max: 10 }).toInt(), body('country').optional().isString().isLength({ min: 2, max: 2 })]), asyncHandler(async (req, res) => {
    const inserted = await catalogService.seedFromProvider({ queries: req.body.queries || [], pages: req.body.pages || 1, country: req.body.country || 'us', chart: true });
    res.json({ inserted });
}));

router.get('/catalog/stats', asyncHandler(async (req, res) => {
    const [total, active, synthetic, categories] = await Promise.all([
        Track.countDocuments({}), Track.countDocuments({ status: 'ACTIVE', hasLyrics: true }), Track.countDocuments({ synthetic: true }), catalogService.listCategories()
    ]);
    const engine = sessionService.getEngine();
    res.json({ tracks: { total, active, synthetic }, categories, generation: engine.stats, provider: config.provider.name });
}));

/** Daily audit. */
router.get('/daily/:dateKey/audit', validate([param('dateKey').matches(/^\d{4}-\d{2}-\d{2}$/)]), asyncHandler(async (req, res) => {
    const doc = await dailyService.auditChallenge(req.params.dateKey);
    if (!doc) throw notFound('DAILY_NOT_FOUND');
    res.json(doc);
}));

module.exports = router;
