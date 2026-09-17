/**
 * Vertical slice: guest → session → question → answer → feedback → next →
 * complete → results → Lyric IQ → play again.
 */
require('../../setup');
const request = require('supertest');
const { buildApp, seed, makeUser, submissionFor, expectStatus, db } = require('../helpers/app');

let app;
beforeAll(async () => { await db.connect(__filename); await seed(); app = buildApp(); });
afterAll(async () => { await db.disconnect(); });

function expectNoAnswerLeak(question) {
    const serialized = JSON.stringify(question);
    expect(serialized).not.toMatch(/answerKey/);
    expect(serialized).not.toMatch(/canonical/);
    expect(serialized).not.toMatch(/choiceIndex/);
}

describe('guest session lifecycle', () => {
    test('a visitor can start playing with no account and gets a signed guest token', async () => {
        const res = await request(app).post('/api/game/sessions').send({ gameMode: 'QUICK_PLAY' }).expect(201);
        expect(res.body.guestToken).toBeTruthy();
        expect(res.headers['x-guest-token']).toBe(res.body.guestToken);
        expect(res.body.player.isGuest).toBe(true);
        expect(res.body.session.status).toBe('ACTIVE');
        expect(res.body.session.questionCount).toBe(10);
        expect(res.body.question).toBeTruthy();
        expect(res.body.question.prompt.lines.length).toBeGreaterThan(0);
        expectNoAnswerLeak(res.body.question);
        if (res.body.question.answerType === 'MULTIPLE_CHOICE') expect(res.body.question.choices).toHaveLength(4);
    });

    test('answering flows through feedback, streak, score and completion with a Lyric IQ result', async () => {
        const start = await request(app).post('/api/game/sessions').send({ gameMode: 'QUICK_PLAY' }).expect(201);
        const guest = start.body.guestToken;
        const sessionId = start.body.session.id;
        let question = start.body.question;
        let lastBody = null;
        let corrects = 0;

        for (let i = 0; i < 10; i++) {
            const correct = i !== 3; // one deliberate miss
            const submission = await submissionFor(question, { correct });
            const res = await request(app).post(`/api/game/sessions/${sessionId}/answer`).set('X-Guest-Token', guest).send(submission).expect(200);
            lastBody = res.body;
            expect(res.body.correct).toBe(correct);
            expect(typeof res.body.canonicalAnswer).toBe('string');
            expect(typeof res.body.responseTimeMs).toBe('number');
            expect(res.body.track).toBeTruthy();
            expect(res.body.track.title).toBeTruthy();
            if (correct) { corrects++; expect(res.body.pointsAwarded).toBeGreaterThan(0); } else { expect(res.body.pointsAwarded).toBe(0); expect(res.body.streak).toBe(0); }
            if (i < 9) {
                expect(res.body.sessionCompleted).toBe(false);
                expect(res.body.nextQuestion).toBeTruthy();
                expect(res.body.nextQuestion.index).toBe(i + 1);
                expectNoAnswerLeak(res.body.nextQuestion);
                question = res.body.nextQuestion;
            }
        }
        expect(lastBody.sessionCompleted).toBe(true);
        expect(lastBody.nextQuestion).toBeNull();
        expect(lastBody.session.status).toBe('COMPLETED');
        expect(lastBody.session.correctCount).toBe(corrects);
        expect(lastBody.session.wrongCount).toBe(1);
        expect(lastBody.session.bestStreak).toBe(6);
        expect(lastBody.results.lyricIq.after).toBeGreaterThan(0);
        expect(lastBody.results.lyricIq.provisional).toBe(false); // 10 questions reached threshold
        expect(lastBody.results.breakdown).toHaveLength(10);
        expect(lastBody.results.share.text).toMatch(/LYRIC IQ: \d+/);

        const results = await request(app).get(`/api/game/sessions/${sessionId}/results`).set('X-Guest-Token', guest).expect(200);
        expect(results.body.session.score).toBe(lastBody.session.score);
        expect(results.body.lyricIq.after).toBe(lastBody.results.lyricIq.after);

        // Play again → a fresh session, Lyric IQ carried forward as "before".
        const again = await request(app).post('/api/game/sessions').set('X-Guest-Token', guest).send({ gameMode: 'QUICK_PLAY' }).expect(201);
        expect(again.body.session.id).not.toBe(sessionId);
        expect(again.body.guestToken).toBeUndefined();
        const profile = await request(app).get('/api/profile/me').set('X-Guest-Token', guest).expect(200);
        expect(profile.body.lyricIq.value).toBe(lastBody.results.lyricIq.after);
        expect(profile.body.metrics.totals.attempts).toBe(10);
    });

    test('duplicate submission for the same question is rejected', async () => {
        const start = await request(app).post('/api/game/sessions').send({}).expect(201);
        const guest = start.body.guestToken;
        const submission = await submissionFor(start.body.question);
        await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set('X-Guest-Token', guest).send(submission).expect(200);
        const dup = await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set('X-Guest-Token', guest).send(submission).expect(409);
        expect(dup.body.error.code).toBe('QUESTION_ALREADY_ANSWERED');
    });

    test('GET question returns the pending question without regenerating', async () => {
        const start = await request(app).post('/api/game/sessions').send({}).expect(201);
        const guest = start.body.guestToken;
        const q = await request(app).get(`/api/game/sessions/${start.body.session.id}/question`).set('X-Guest-Token', guest).expect(200);
        expect(q.body.question.id).toBe(start.body.question.id);
        expectNoAnswerLeak(q.body.question);
    });

    test('another player cannot read or answer a session', async () => {
        const a = await request(app).post('/api/game/sessions').send({}).expect(201);
        const b = await request(app).post('/api/game/sessions').send({}).expect(201);
        await request(app).get(`/api/game/sessions/${a.body.session.id}/question`).set('X-Guest-Token', b.body.guestToken).expect(403);
        await request(app).post(`/api/game/sessions/${a.body.session.id}/answer`).set('X-Guest-Token', b.body.guestToken).send({ questionId: a.body.question.id, choiceIndex: 0 }).expect(403);
    });

    test('invalid / unknown session and validation failures produce clean errors', async () => {
        const start = await request(app).post('/api/game/sessions').send({}).expect(201);
        const guest = start.body.guestToken;
        await request(app).get('/api/game/sessions/not-an-id/question').set('X-Guest-Token', guest).expect(400);
        const missing = await request(app).get('/api/game/sessions/64b000000000000000000000/question').set('X-Guest-Token', guest).expect(404);
        expect(missing.body.error.code).toBe('SESSION_NOT_FOUND');
        const bad = await request(app).post('/api/game/sessions').send({ gameMode: 'JEOPARDY' }).expect(400);
        expect(bad.body.error.code).toBe('VALIDATION_FAILED');
        const noPlayer = await request(app).get(`/api/game/sessions/${start.body.session.id}/question`).expect(401);
        expect(noPlayer.body.error.code).toBe('PLAYER_REQUIRED');
        const malformed = await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set('X-Guest-Token', guest).send({ questionId: start.body.question.id, choiceIndex: 99 }).expect(400);
        expect(malformed.body.error.code).toBe('VALIDATION_FAILED');
    });

    test('a wrong choice index or garbage typed answer is simply incorrect', async () => {
        const start = await request(app).post('/api/game/sessions').send({}).expect(201);
        const guest = start.body.guestToken;
        const q = start.body.question;
        const body = q.answerType === 'MULTIPLE_CHOICE' ? { questionId: q.id, choiceIndex: 9 } : { questionId: q.id, answer: '!!!???' };
        const res = await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set('X-Guest-Token', guest).send(body).expect(q.answerType === 'MULTIPLE_CHOICE' ? 200 : 200);
        expect(res.body.correct).toBe(false);
    });

    test('registered users play under their user identity and appear on the profile', async () => {
        const { token } = await makeUser('ivy');
        const start = expectStatus(await request(app).post('/api/game/sessions').set('Authorization', `Bearer ${token}`).send({ gameMode: 'QUICK_PLAY', category: 'pop' }), 201);
        expect(start.body.player.isGuest).toBe(false);
        expect(start.body.guestToken).toBeUndefined();
        expect(start.body.session.category).toBe('pop');
        const profile = await request(app).get('/api/profile/me').set('Authorization', `Bearer ${token}`).expect(200);
        expect(profile.body.player.displayName).toBe('ivy');
    });

    test('config endpoint lists modes, categories and flags', async () => {
        const res = await request(app).get('/api/game/config').expect(200);
        expect(res.body.modes.map((m) => m.key)).toEqual(expect.arrayContaining(['QUICK_PLAY', 'DAILY_10', 'RAPID_FIRE', 'STREAK']));
        expect(res.body.categories.length).toBeGreaterThan(0);
        expect(res.body.flags.guestPlay).toBe(true);
    });
});
