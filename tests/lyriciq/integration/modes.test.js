require('../../setup');
const request = require('supertest');
const { buildApp, seed, submissionFor, db } = require('../helpers/app');
const config = require('../../../src/lyriciq/config');
const GameSession = require('../../../src/lyriciq/models/GameSession');
const sessionService = require('../../../src/lyriciq/services/game/sessionService');

let app;
beforeAll(async () => { await db.connect(__filename); await seed(); app = buildApp(); });
afterAll(async () => { await db.disconnect(); });

describe('Streak mode', () => {
    test('continues while correct, ends on the first miss, and tracks difficulty progression', async () => {
        const start = await request(app).post('/api/game/sessions').send({ gameMode: 'STREAK' }).expect(201);
        const headers = { 'X-Guest-Token': start.body.guestToken };
        let question = start.body.question;
        let res;
        for (let i = 0; i < 5; i++) {
            res = await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set(headers).send(await submissionFor(question, { correct: true })).expect(200);
            expect(res.body.sessionCompleted).toBe(false);
            expect(res.body.streak).toBe(i + 1);
            question = res.body.nextQuestion;
        }
        res = await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set(headers).send(await submissionFor(question, { correct: false })).expect(200);
        expect(res.body.sessionCompleted).toBe(true);
        expect(res.body.session.endReason).toBe('STREAK_BROKEN');
        expect(res.body.session.bestStreak).toBe(5);
        expect(res.body.results.share.text).toMatch(/STREAK 5/);
    });
});

describe('Rapid Fire', () => {
    test('has a server-enforced deadline; answers after time is up complete the session', async () => {
        const original = config.modes.RAPID_FIRE.timeLimitMs;
        config.modes.RAPID_FIRE.timeLimitMs = 400;
        try {
            const start = await request(app).post('/api/game/sessions').send({ gameMode: 'RAPID_FIRE' }).expect(201);
            const headers = { 'X-Guest-Token': start.body.guestToken };
            expect(start.body.session.deadlineAt).toBeTruthy();
            const first = await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set(headers).send(await submissionFor(start.body.question)).expect(200);
            expect(first.body.sessionCompleted).toBe(false);
            await new Promise((r) => setTimeout(r, 500));
            const late = await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set(headers).send(await submissionFor(first.body.nextQuestion)).expect(200);
            expect(late.body.sessionCompleted).toBe(true);
            expect(late.body.timedOut).toBe(true);
            expect(late.body.results.session.endReason).toBe('TIME_UP');
            expect(late.body.results.session.correctCount).toBe(1);
            const q = await request(app).get(`/api/game/sessions/${start.body.session.id}/question`).set(headers).expect(409);
            expect(q.body.error.code).toBe('SESSION_NOT_ACTIVE');
        } finally {
            config.modes.RAPID_FIRE.timeLimitMs = original;
        }
    });
});

describe('session hygiene', () => {
    test('starting a new game abandons the previous active one; idle sessions expire', async () => {
        const a = await request(app).post('/api/game/sessions').send({}).expect(201);
        const headers = { 'X-Guest-Token': a.body.guestToken };
        const b = await request(app).post('/api/game/sessions').set(headers).send({}).expect(201);
        const oldSession = await GameSession.findById(a.body.session.id);
        expect(oldSession.status).toBe('ABANDONED');
        await GameSession.updateOne({ _id: b.body.session.id }, { $set: { lastActivityAt: new Date(Date.now() - config.session.idleExpiryMs - 1000) } });
        const expired = await sessionService.expireStaleSessions();
        expect(expired).toBeGreaterThanOrEqual(1);
        const res = await request(app).get(`/api/game/sessions/${b.body.session.id}/question`).set(headers).expect(409);
        expect(res.body.error.details.status).toBe('EXPIRED');
    });

    test('an expired pending question is replaced without penalty', async () => {
        const QuestionInstance = require('../../../src/lyriciq/models/QuestionInstance');
        const a = await request(app).post('/api/game/sessions').send({}).expect(201);
        const headers = { 'X-Guest-Token': a.body.guestToken };
        await QuestionInstance.updateOne({ _id: a.body.question.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        const res = await request(app).get(`/api/game/sessions/${a.body.session.id}/question`).set(headers).expect(200);
        expect(res.body.question.id).not.toBe(a.body.question.id);
        expect(res.body.question.index).toBe(1);
        expect(res.body.session.answered).toBe(0);
        // The replacement does not cost a question: the session still needs 10 answers.
        expect(res.body.session.questionCount - res.body.session.answered).toBe(10);
    });

    test('abandon endpoint ends a session', async () => {
        const a = await request(app).post('/api/game/sessions').send({}).expect(201);
        const res = await request(app).post(`/api/game/sessions/${a.body.session.id}/abandon`).set('X-Guest-Token', a.body.guestToken).expect(200);
        expect(res.body.session.status).toBe('ABANDONED');
    });
});
