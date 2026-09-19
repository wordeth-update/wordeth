/**
 * Share cards: a completed session gets a public page with Open Graph tags and a
 * rendered card image; nothing on it leaks lyrics or answers.
 */
require('../../setup');
const fs = require('fs');
const express = require('express');
const request = require('supertest');
const { buildApp, seed, makeUser, submissionFor, db } = require('../helpers/app');
const { createSharePagesRouter } = require('../../../src/lyriciq/routes/sharePages');
const shareService = require('../../../src/lyriciq/services/share/shareService');
const cardRenderer = require('../../../src/lyriciq/services/share/cardRenderer');
const GameSession = require('../../../src/lyriciq/models/GameSession');

const chromium = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
if (chromium) process.env.PUPPETEER_EXECUTABLE_PATH = chromium;
const pngTest = chromium ? test : test.skip;

let app;
beforeAll(async () => {
    await db.connect(__filename); await seed();
    app = buildApp();
    app.use(createSharePagesRouter());
});
afterAll(async () => { await cardRenderer.stop(); await db.disconnect(); });

/** Play a whole Quick Play round as the given identity and return the results body. */
async function playRound(headers) {
    const start = await request(app).post('/api/game/sessions').set(headers).send({}).expect(201);
    const sid = start.body.session.id;
    const h = { ...headers }; if (start.body.guestToken) h['X-Guest-Token'] = start.body.guestToken;
    let question = start.body.question; let res;
    for (let i = 0; i < 12 && question; i++) {
        res = await request(app).post(`/api/game/sessions/${sid}/answer`).set(h).send(await submissionFor(question, { correct: i % 2 === 0 })).expect(200);
        if (res.body.sessionCompleted) return { sid, results: res.body.results, headers: h };
        question = res.body.nextQuestion;
    }
    throw new Error('round did not complete');
}

describe('share card snapshot', () => {
    test('a completed session stores a public snapshot with the player\'s first name and the result headline', async () => {
        const { user, token } = await makeUser('Cory Jackson');
        const { sid, results } = await playRound({ Authorization: `Bearer ${token}` });
        const session = await GameSession.findById(sid).lean();
        expect(session.shareCard).toMatchObject({ version: 1, displayName: 'Cory', world: expect.stringMatching(/block|court|rooftop/) });
        expect(session.shareCard.headline).toMatch(/\d+\/10 · \d+ pts/);
        expect(session.shareCard.lyricIq).toBe(results.lyricIq.after);
        // Links point at the public page + card, both as paths (for the client) and absolute URLs.
        expect(results.share).toMatchObject({ pagePath: `/s/${sid}`, cardPath: `/s/${sid}/card.png`, storyPath: `/s/${sid}/story.png`, version: 2 });
        expect(results.share.pageUrl).toMatch(/^https?:\/\/.+\/s\//);
        expect(results.share.short).toMatch(/Lyric IQ/);
        expect(user.name).toBe('Cory Jackson');
    });
    test('guests stay anonymous on the card', async () => {
        const { sid } = await playRound({});
        const session = await GameSession.findById(sid).lean();
        expect(session.shareCard.displayName).toBe('Someone on Wordeth');
    });
    test('pure helpers: tiers, copy and name shortening', () => {
        expect(shareService.worldForIq(20)).toBe('block');
        expect(shareService.worldForIq(50)).toBe('court');
        expect(shareService.worldForIq(75)).toBe('rooftop');
        expect(shareService.worldForIq(null)).toBe('block');
        expect(shareService.publicName('Jasmine Lee-Ray', false)).toBe('Jasmine');
        expect(shareService.publicName('Guest', true)).toBe('Someone on Wordeth');
        expect(shareService.sessionHeadline({ gameMode: 'STREAK', bestStreak: 9, correctCount: 9, wrongCount: 1 })).toBe('Streak of 9');
        expect(shareService.sessionHeadline({ gameMode: 'RAPID_FIRE', correctCount: 14, wrongCount: 3 })).toBe('Rapid Fire · 14 in 60s');
        expect(shareService.iqLine(82)).toMatch(/aux/);
    });
});

describe('share pages', () => {
    test('the public page carries Open Graph and Twitter tags, the card and a play link, with no lyrics', async () => {
        const { sid, results } = await playRound({});
        const page = await request(app).get(`/s/${sid}`).expect(200);
        expect(page.headers['content-type']).toMatch(/html/);
        expect(page.headers['content-security-policy']).toBeUndefined();
        const html = page.text;
        expect(html).toContain(`property="og:image" content="http://127.0.0.1`); // request origin outside production
        expect(html).toContain(`/s/${sid}/card.png"`);
        expect(html).toContain('twitter:card" content="summary_large_image"');
        expect(html).toContain(`/play?challenge=${sid}`);
        expect(html).toMatch(/Someone on Wordeth (has a Lyric IQ of \d+|took the Lyric IQ test)/);
        // Nothing from the run's questions leaks onto a public page.
        for (const b of results.breakdown) if (b.track) expect(html).not.toContain(b.track.title);
        expect(html).not.toMatch(/answerKey|"canonical":|choiceIndex/); // the <link rel="canonical"> tag is fine
    });
    test('unknown, malformed and unfinished sessions get a 404 page and no card', async () => {
        await request(app).get('/s/000000000000000000000000').expect(404);
        await request(app).get('/s/not-an-id').expect(404);
        await request(app).get('/s/000000000000000000000000/card.png').expect(404);
        const start = await request(app).post('/api/game/sessions').send({}).expect(201);
        await request(app).get(`/s/${start.body.session.id}`).expect(404); // still ACTIVE
    });
    pngTest('the card renders as a PNG in both formats and is cached', async () => {
        const { sid } = await playRound({});
        const og = await request(app).get(`/s/${sid}/card.png`).buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
        expect(og.headers['content-type']).toBe('image/png');
        expect(og.headers['cache-control']).toMatch(/immutable/);
        expect(og.body.slice(1, 4).toString()).toBe('PNG');
        // PNG IHDR: width at bytes 16-19, height 20-23.
        expect(og.body.readUInt32BE(16)).toBe(1200); expect(og.body.readUInt32BE(20)).toBe(630);
        const story = await request(app).get(`/s/${sid}/story.png`).buffer(true).parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
        expect(story.body.readUInt32BE(16)).toBe(1080); expect(story.body.readUInt32BE(20)).toBe(1920);
        expect(cardRenderer._pngCache.has(`${sid}:og`)).toBe(true);
    }, 60000);
    test('the card markup never includes lyric text and carries the world scene', () => {
        const html = cardRenderer.renderCardHtml({ version: 1, displayName: 'Cory', lyricIq: 82, provisional: false, line: 'Runs the aux.', headline: 'Streak of 9', topGenre: { key: 'hiphop', label: 'Hip-Hop IQ', value: 88 }, dailyStreak: 4, world: 'rooftop' }, { format: 'og' });
        expect(html).toContain('>82<');
        expect(html).toContain('Cory');
        expect(html).toContain('Hip-Hop IQ 88');
        expect(html).toContain('4-day streak');
        expect(html).toContain('class="liq-scene"'); // inlined SVG scene
        expect(html).toContain('Plays on the rooftop');
        const story = cardRenderer.renderCardHtml({ version: 0, displayName: 'Someone on Wordeth', lyricIq: null, line: 'Unscored.', headline: null, topGenre: null, dailyStreak: 0, world: 'block' }, { format: 'story' });
        expect(story).toContain('width:1080px');
        expect(story).toContain('>—<');
    });
});
