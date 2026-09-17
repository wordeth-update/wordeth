require('../../setup');
const request = require('supertest');
const { buildApp, seed, makeUser, db } = require('../helpers/app');
const Track = require('../../../src/lyriciq/models/Track');
const catalogService = require('../../../src/lyriciq/services/content/catalogService');

let app;
beforeAll(async () => { await db.connect(__filename); await seed(); app = buildApp(); });
afterAll(async () => { await db.disconnect(); });

const KEY = { 'X-Internal-Key': 'test-internal-key' };

describe('internal content controls', () => {
    test('reject unauthenticated and non-admin callers', async () => {
        await request(app).get('/api/internal/flags').expect(401);
        await request(app).get('/api/internal/flags').set('X-Internal-Key', 'wrong').expect(401);
        const { token } = await makeUser('fan');
        await request(app).get('/api/internal/flags').set('Authorization', `Bearer ${token}`).expect(403);
        const { token: adminToken } = await makeUser('boss', { role: 'ADMIN' });
        await request(app).get('/api/internal/flags').set('Authorization', `Bearer ${adminToken}`).expect(200);
    });

    test('disabling a track removes it from gameplay without a deploy', async () => {
        const track = await Track.findOne({ synthetic: true });
        const before = await catalogService.getEligibleTracks({});
        expect(before.some((t) => String(t._id) === String(track._id))).toBe(true);
        await request(app).post(`/api/internal/tracks/${track._id}/disable`).set(KEY).send({ reason: 'rights issue' }).expect(200);
        const after = await catalogService.getEligibleTracks({});
        expect(after.some((t) => String(t._id) === String(track._id))).toBe(false);
        await request(app).post(`/api/internal/tracks/${track._id}/enable`).set(KEY).expect(200);
        const restored = await catalogService.getEligibleTracks({});
        expect(restored.some((t) => String(t._id) === String(track._id))).toBe(true);
    });

    test('disabling an artist removes all their tracks, optionally per mode', async () => {
        const track = await Track.findOne({ synthetic: true, artistKey: 'vera-solace' });
        expect(track).toBeTruthy();
        await request(app).post('/api/internal/artists/vera-solace/disable').set(KEY).send({ gameModes: ['STREAK'] }).expect(200);
        const streakPool = await catalogService.getEligibleTracks({ gameMode: 'STREAK' });
        const quickPool = await catalogService.getEligibleTracks({ gameMode: 'QUICK_PLAY' });
        expect(streakPool.some((t) => t.artistKey === 'vera-solace')).toBe(false);
        expect(quickPool.some((t) => t.artistKey === 'vera-solace')).toBe(true);
        await request(app).post('/api/internal/artists/vera-solace/enable').set(KEY).expect(200);
    });

    test('explicit restriction and feature flags are toggleable', async () => {
        await request(app).post('/api/internal/restrictions').set(KEY).send({ type: 'EXPLICIT', value: 'true' }).expect(201);
        const pool = await catalogService.getEligibleTracks({});
        expect(pool.every((t) => !t.explicit)).toBe(true);
        await request(app).delete('/api/internal/restrictions').set(KEY).send({ type: 'EXPLICIT', value: 'true' }).expect(200);

        await request(app).put('/api/internal/flags/streakMode').set(KEY).send({ enabled: false }).expect(200);
        const blocked = await request(app).post('/api/game/sessions').send({ gameMode: 'STREAK' }).expect(403);
        expect(blocked.body.error.code).toBe('GAME_MODE_DISABLED');
        const cfg = await request(app).get('/api/game/config').expect(200);
        expect(cfg.body.modes.map((m) => m.key)).not.toContain('STREAK');
        await request(app).put('/api/internal/flags/streakMode').set(KEY).send({ enabled: true }).expect(200);
        await request(app).put('/api/internal/flags/nope').set(KEY).send({ enabled: true }).expect(400);
    });

    test('a served question can be rejected and its track disabled', async () => {
        const start = await request(app).post('/api/game/sessions').send({}).expect(201);
        const res = await request(app).post(`/api/internal/questions/${start.body.question.id}/reject`).set(KEY).send({ reason: 'bad blank', disableTrack: true }).expect(200);
        expect(res.body.status).toBe('REJECTED');
        expect(res.body.trackDisabled).toBe(true);
        const stats = await request(app).get('/api/internal/catalog/stats').set(KEY).expect(200);
        expect(stats.body.tracks.total).toBeGreaterThan(0);
        expect(stats.body.provider).toBe('synthetic');
    });
});
