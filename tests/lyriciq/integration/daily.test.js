require('../../setup');
const request = require('supertest');
const { buildApp, seed, makeUser, submissionFor, db } = require('../helpers/app');
const DailyChallenge = require('../../../src/lyriciq/models/DailyChallenge');
const dailyService = require('../../../src/lyriciq/services/game/dailyService');
const { answerKeyFor } = require('../helpers/app');

let app;
beforeAll(async () => { await db.connect(__filename); await seed(); app = buildApp(); });
afterAll(async () => { await db.disconnect(); });

async function playDaily(auth, { misses = 0 } = {}) {
    const start = await request(app).post('/api/daily/start').set(auth).send({}).expect(201);
    const guest = start.body.guestToken;
    const headers = guest ? { 'X-Guest-Token': guest } : auth;
    let question = start.body.question;
    let body = null;
    for (let i = 0; i < start.body.session.questionCount; i++) {
        const sub = await submissionFor(question, { correct: i >= misses });
        body = (await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set(headers).send(sub).expect(200)).body;
        question = body.nextQuestion;
    }
    return { start, headers, final: body };
}

describe('Daily 10', () => {
    test('is generated once, deterministically, and every player receives the same logical set', async () => {
        const a = await request(app).post('/api/daily/start').send({}).expect(201);
        const b = await request(app).post('/api/daily/start').send({}).expect(201);
        expect(a.body.session.gameMode).toBe('DAILY_10');
        expect(a.body.session.dailyDateKey).toBe(dailyService.dateKeyFor());
        expect(a.body.question.prompt.lines).toEqual(b.body.question.prompt.lines);
        expect(a.body.question.choices).toEqual(b.body.question.choices);
        expect(await DailyChallenge.countDocuments({})).toBe(1);
        const keyA = await answerKeyFor(a.body.question.id);
        const keyB = await answerKeyFor(b.body.question.id);
        expect(keyA.canonical).toBe(keyB.canonical);
        // Audit record holds the full spec including answers
        const audit = await dailyService.auditChallenge(dailyService.dateKeyFor());
        expect(audit.questionSpecs.length).toBe(a.body.session.questionCount);
        expect(audit.questionSpecs[0].answerKey.canonical).toBe(keyA.canonical);
        expect(audit.seed).toBe(dailyService.seedFor(dailyService.dateKeyFor()));
    });

    test('resumes an active daily session and blocks a second play after completion', async () => {
        const start = await request(app).post('/api/daily/start').send({}).expect(201);
        const headers = { 'X-Guest-Token': start.body.guestToken };
        const resume = await request(app).post('/api/daily/start').set(headers).send({}).expect(200);
        expect(resume.body.resumed).toBe(true);
        expect(resume.body.session.id).toBe(start.body.session.id);
        expect(resume.body.question.id).toBe(start.body.question.id);

        let question = start.body.question;
        for (let i = 0; i < start.body.session.questionCount; i++) {
            const sub = await submissionFor(question, { correct: true });
            const res = await request(app).post(`/api/game/sessions/${start.body.session.id}/answer`).set(headers).send(sub).expect(200);
            question = res.body.nextQuestion;
        }
        const again = await request(app).post('/api/daily/start').set(headers).send({}).expect(409);
        expect(again.body.error.code).toBe('DAILY_ALREADY_PLAYED');
        expect(again.body.error.details.results.session.status).toBe('COMPLETED');

        const info = await request(app).get('/api/daily').set(headers).expect(200);
        expect(info.body.status).toBe('COMPLETED');
        expect(info.body.summary.correct).toBe(start.body.session.questionCount);
        expect(info.body.dailyStreak).toBe(1);
        expect(info.body.stats.completions).toBeGreaterThanOrEqual(1);
    });

    test('daily leaderboard ranks registered players by score; guests are not listed', async () => {
        const { token } = await makeUser('dailyace');
        await playDaily({ Authorization: `Bearer ${token}` });
        await playDaily({}, { misses: 3 });
        const board = await request(app).get('/api/leaderboards/daily').set('Authorization', `Bearer ${token}`).expect(200);
        expect(board.body.entries.length).toBeGreaterThanOrEqual(1);
        expect(board.body.entries.every((e) => e.displayName !== 'Guest')).toBe(true);
        expect(board.body.entries[0].displayName).toBe('dailyace');
        expect(board.body.me.rank).toBe(1);
        const weekly = await request(app).get('/api/leaderboards/weekly').expect(200);
        expect(weekly.body.entries.find((e) => e.displayName === 'dailyace')).toBeTruthy();
        const allTime = await request(app).get('/api/leaderboards/all-time').expect(200);
        expect(allTime.body.entries.find((e) => e.displayName === 'dailyace').value).toBeGreaterThan(0);
    });
});
