/**
 * Artist scope: pick an artist, every question is theirs; Artist IQ board fills in.
 */
require('../../setup');
const request = require('supertest');
const { buildApp, seed, makeUser, submissionFor, expectStatus, db } = require('../helpers/app');
const config = require('../../../src/lyriciq/config');
const Track = require('../../../src/lyriciq/models/Track');
const GameSession = require('../../../src/lyriciq/models/GameSession');
const QuestionInstance = require('../../../src/lyriciq/models/QuestionInstance');

let app;
let artist;
beforeAll(async () => {
    await db.connect(__filename);
    await seed();
    config.catalog.minArtistTracks = 2; // the synthetic fixture holds two songs per artist
    app = buildApp();
    const sample = await Track.findOne({ status: 'ACTIVE', hasLyrics: true }).lean();
    artist = { key: sample.artistKey, name: sample.artist };
});
afterAll(async () => { await db.disconnect(); });

async function playThrough(agent, start, headers) {
    let question = start.body.question;
    let body = start.body;
    for (let guard = 0; guard < 30 && question; guard++) {
        const res = await agent.post(`/api/game/sessions/${start.body.session.id}/answer`).set(headers).send(await submissionFor(question, { correct: true }));
        expectStatus(res, 200);
        body = res.body;
        if (res.body.sessionCompleted) break;
        question = res.body.nextQuestion;
    }
    return body;
}

describe('artist picker', () => {
    test('finds artists the catalogue holds and says whether they are ready', async () => {
        const res = await request(app).get('/api/game/artists').query({ q: artist.name.slice(0, 4) });
        expectStatus(res, 200);
        const hit = res.body.artists.find((a) => a.key === artist.key);
        expect(hit).toBeTruthy();
        expect(hit.name).toBe(artist.name);
        expect(hit.tracks).toBeGreaterThanOrEqual(2);
        expect(hit.ready).toBe(true);
    });
    test('rejects a query that is too short or too long', async () => {
        expectStatus(await request(app).get('/api/game/artists').query({ q: 'a' }), 400);
        expectStatus(await request(app).get('/api/game/artists').query({ q: 'x'.repeat(61) }), 400);
    });
});

describe('artist-scoped session', () => {
    test('every question comes from the chosen artist and the session carries the scope', async () => {
        const start = await request(app).post('/api/game/sessions').send({ gameMode: 'QUICK_PLAY', artist: { key: artist.key, name: artist.name } });
        expectStatus(start, 201);
        expect(start.body.session.artist).toEqual({ key: artist.key, name: artist.name });
        expect(start.body.question.template).not.toBe('GUESS_THE_ARTIST');
        const headers = { 'X-Guest-Token': start.body.guestToken };
        await playThrough(request(app), start, headers);
        const served = await QuestionInstance.find({ sessionId: start.body.session.id }).lean();
        expect(served.length).toBeGreaterThanOrEqual(10);
        const trackIds = [...new Set(served.map((q) => String(q.trackId)))];
        const tracks = await Track.find({ _id: { $in: trackIds } }).lean();
        expect(tracks.every((t) => t.artistKey === artist.key)).toBe(true);
        expect(served.every((q) => q.template !== 'GUESS_THE_ARTIST')).toBe(true);
        const done = await GameSession.findById(start.body.session.id).lean();
        expect(done.status).toBe('COMPLETED');
        expect(done.shareCard.artist.key).toBe(artist.key);
    });

    test('an unknown artist is refused cleanly, nothing abandoned', async () => {
        const first = await request(app).post('/api/game/sessions').send({ gameMode: 'QUICK_PLAY' });
        expectStatus(first, 201);
        const headers = { 'X-Guest-Token': first.body.guestToken };
        const res = await request(app).post('/api/game/sessions').set(headers).send({ gameMode: 'QUICK_PLAY', artist: { key: 'nobody-at-all', name: 'Nobody At All' } });
        expectStatus(res, 503);
        expect(res.body.error.code).toBe('ARTIST_TOO_THIN');
        const still = await GameSession.findById(first.body.session.id).lean();
        expect(still.status).toBe('ACTIVE');
    });

    test('bad artist payloads are rejected', async () => {
        expectStatus(await request(app).post('/api/game/sessions').send({ gameMode: 'QUICK_PLAY', artist: 'drake' }), 400);
        expectStatus(await request(app).post('/api/game/sessions').send({ gameMode: 'QUICK_PLAY', artist: { key: 'Not A Slug!' } }), 400);
        expectStatus(await request(app).post('/api/game/sessions').send({ gameMode: 'QUICK_PLAY', artist: { providerArtistId: '1; drop' } }), 400);
    });
});

describe('Artist IQ board', () => {
    test('a signed-in player lands on the artist board after a scoped round', async () => {
        const { token } = await makeUser('artistfan');
        const headers = { Authorization: `Bearer ${token}` };
        const start = await request(app).post('/api/game/sessions').set(headers).send({ gameMode: 'QUICK_PLAY', artist: { key: artist.key } });
        expectStatus(start, 201);
        await playThrough(request(app), start, headers);
        const board = await request(app).get(`/api/leaderboards/artist/${artist.key}`).set(headers);
        expectStatus(board, 200);
        expect(board.body.board).toBe('ARTIST');
        expect(board.body.periodKey).toBe(artist.key);
        expect(board.body.artist.name).toBe(artist.name);
        expect(board.body.entries.some((e) => e.isYou)).toBe(true);
        expect(board.body.me.ranked).toBe(true);
        expectStatus(await request(app).get('/api/leaderboards/artist/Bad%20Key'), 400);
    });
});
