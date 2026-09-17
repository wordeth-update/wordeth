require('../../setup');
const request = require('supertest');
const { buildApp, seed, makeUser, submissionFor, db } = require('../helpers/app');
const PlayerMetrics = require('../../../src/lyriciq/models/PlayerMetrics');

let app;
beforeAll(async () => { await db.connect(__filename); await seed(); app = buildApp(); });
afterAll(async () => { await db.disconnect(); });

async function playQuick(headers, n = 10) {
    const start = await request(app).post('/api/game/sessions').set(headers).send({}).expect(201);
    const h = start.body.guestToken ? { 'X-Guest-Token': start.body.guestToken } : headers;
    let q = start.body.question;
    let body;
    for (let i = 0; i < n; i++) {
        body = (await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set(h).send(await submissionFor(q)).expect(200)).body;
        q = body.nextQuestion;
    }
    return { headers: h, guestToken: start.body.guestToken, final: body };
}

describe('profile and guest migration', () => {
    test('profile requires an identity and explains Lyric IQ', async () => {
        await request(app).get('/api/profile/me').expect(401);
        const { headers } = await playQuick({});
        const me = await request(app).get('/api/profile/me').set(headers).expect(200);
        expect(me.body.lyricIq.value).toBeGreaterThan(0);
        expect(me.body.explanation.length).toBeGreaterThan(3);
        expect(me.body.metrics.sessionsCompleted).toBe(1);
        expect(me.body.recentSessions).toHaveLength(1);
        const iq = await request(app).get('/api/profile/me/lyric-iq').set(headers).expect(200);
        expect(iq.body.lyricIq.version).toBe(1);
        // Category scores are withheld below the sample threshold
        expect(Object.keys(iq.body.lyricIq.subScores.genres)).toHaveLength(0);
    });

    test('"Save your Lyric IQ": a guest history is migrated into a new user account', async () => {
        const { guestToken, final } = await playQuick({});
        const { token, user } = await makeUser('newbie');
        await request(app).post('/api/profile/claim-guest').set('X-Guest-Token', guestToken).send({ guestToken }).expect(403);
        const claim = await request(app).post('/api/profile/claim-guest').set('Authorization', `Bearer ${token}`).send({ guestToken }).expect(200);
        expect(claim.body.sessionsMigrated).toBe(1);
        expect(claim.body.lyricIq.value).toBe(final.results.lyricIq.after);
        const me = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`).expect(200);
        expect(me.body.metrics.totals.attempts).toBe(10);
        expect(me.body.recentSessions).toHaveLength(1);
        expect(await PlayerMetrics.countDocuments({ playerKey: `guest:${JSON.parse(Buffer.from(guestToken.split('.')[1], 'base64').toString()).guestId}` })).toBe(0);
        expect((await PlayerMetrics.findOne({ playerKey: `user:${user._id}` })).totals.attempts).toBe(10);
        const bad = await request(app).post('/api/profile/claim-guest').set('Authorization', `Bearer ${token}`).send({ guestToken: 'not.a.token' }).expect(400);
        expect(bad.body.error.code).toBe('INVALID_GUEST_TOKEN');
    });

    test('claiming a guest into a user who already played merges metrics', async () => {
        const { token } = await makeUser('veteran');
        await playQuick({ Authorization: `Bearer ${token}` });
        const { guestToken } = await playQuick({});
        const claim = await request(app).post('/api/profile/claim-guest').set('Authorization', `Bearer ${token}`).send({ guestToken }).expect(200);
        expect(claim.body.sessionsMigrated).toBe(1);
        const me = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`).expect(200);
        expect(me.body.metrics.totals.attempts).toBe(20);
        expect(me.body.metrics.sessionsCompleted).toBe(2);
    });
});
