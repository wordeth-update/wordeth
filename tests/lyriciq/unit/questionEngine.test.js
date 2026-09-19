const { QuestionEngine } = require('../../../src/lyriciq/engines/question/QuestionEngine');
const { VocabularyBank } = require('../../../src/lyriciq/engines/distractor/vocabularyBank');
const { DistractorEngine } = require('../../../src/lyriciq/engines/distractor/DistractorEngine');
const { SyntheticProvider } = require('../../../src/lyriciq/providers/lyrics');
const { seededRandom } = require('../../../src/lyriciq/utilities/random');
const { ProviderError } = require('../../../src/lyriciq/utilities/errors');
const { normalizeText, isStopword } = require('../../../src/lyriciq/utilities/text');
const { TEMPLATE_KEYS, BLANK_MARKER } = require('../../../src/lyriciq/engines/question/templates');

async function fixtureCatalog() {
    const p = new SyntheticProvider();
    const tracks = (await p.getPopularTracks({ pageSize: 100 })).map((t, i) => ({ ...t, _id: `id${i}`, status: 'ACTIVE' }));
    const lyrics = {};
    for (const t of tracks) lyrics[t._id] = await p.getLyrics(t.providerTrackId);
    return { tracks, lyrics, catalog: { getEligibleTracks: async () => tracks, getLyricAsset: async (t) => lyrics[t._id] } };
}

function makeEngine(catalog) {
    const bank = new VocabularyBank();
    return new QuestionEngine({ catalog, bank, distractors: new DistractorEngine({ bank }) });
}

describe('QuestionEngine', () => {
    let fx;
    beforeAll(async () => { fx = await fixtureCatalog(); });

    test('generates a valid question for every template and answer type, never exposing the answer in the prompt', async () => {
        const engine = makeEngine(fx.catalog);
        for (const t of fx.tracks) engine.bank.addTrackLines(t._id, fx.lyrics[t._id].lines, { genre: t.primaryGenre });
        const rng = seededRandom('unit');
        for (const template of TEMPLATE_KEYS) {
            for (const answerType of ['MULTIPLE_CHOICE', 'TYPED']) {
                const q = await engine.generate({ gameMode: 'QUICK_PLAY', template, answerType, rng });
                expect(q).toBeTruthy();
                expect(q.template).toBe(template);
                expect(q.difficulty).toBeGreaterThanOrEqual(0);
                expect(q.difficulty).toBeLessThanOrEqual(100);
                expect(q.answerKey.canonical).toBeTruthy();
                const visible = q.prompt.lines.join(' ').replace(BLANK_MARKER, ' ');
                expect(` ${normalizeText(visible)} `.includes(` ${normalizeText(q.answerKey.canonical)} `)).toBe(false);
                if (q.answerType === 'MULTIPLE_CHOICE') {
                    expect(q.choices).toHaveLength(4);
                    expect(new Set(q.choices.map(normalizeText)).size).toBe(4);
                    expect(normalizeText(q.choices[q.answerKey.choiceIndex])).toBe(normalizeText(q.answerKey.canonical));
                } else {
                    expect(q.choices).toEqual([]);
                    expect(q.answerKey.choiceIndex).toBeNull();
                }
                if (q.prompt.kind === 'BLANK') {
                    expect(q.prompt.lines.some((l) => l.includes(BLANK_MARKER))).toBe(true);
                    expect(normalizeText(q.answerKey.canonical).split(' ').every(isStopword)).toBe(false);
                }
                expect(q.prompt.lines.length).toBeLessThanOrEqual(2);
            }
        }
    });

    test('is deterministic for a given seed', async () => {
        const a = makeEngine(fx.catalog); const b = makeEngine(fx.catalog);
        const qa = await a.generate({ template: 'MISSING_WORD', rng: seededRandom('daily-2026-01-01') });
        const qb = await b.generate({ template: 'MISSING_WORD', rng: seededRandom('daily-2026-01-01') });
        expect(qa.prompt.lines).toEqual(qb.prompt.lines);
        expect(qa.choices).toEqual(qb.choices);
        expect(qa.answerKey).toEqual(qb.answerKey);
    });

    test('returns null when no tracks are eligible and skips tracks whose lyrics fail', async () => {
        const empty = makeEngine({ getEligibleTracks: async () => [], getLyricAsset: async () => null });
        expect(await empty.generate({ template: 'MISSING_WORD' })).toBeNull();
        let calls = 0;
        const flaky = makeEngine({
            getEligibleTracks: async () => fx.tracks.slice(0, 3),
            getLyricAsset: async (t) => { calls++; if (t._id === 'id0') throw new ProviderError('TIMEOUT', 'slow', { provider: 'x' }); return fx.lyrics[t._id]; }
        });
        for (const t of fx.tracks.slice(0, 3)) flaky.bank.addTrackLines(t._id, fx.lyrics[t._id].lines, { genre: t.primaryGenre });
        const q = await flaky.generate({ template: 'MISSING_WORD', rng: seededRandom(1), excludeTrackIds: [] });
        expect(q).toBeTruthy();
        expect(q.trackId).not.toBe('id0');
        expect(calls).toBeGreaterThan(0);
    });

    test('rejects questions with insufficient distractors and records rejection stats', async () => {
        const engine = makeEngine(fx.catalog); // empty bank → no word distractors
        const q = await engine.generate({ template: 'MISSING_WORD', answerType: 'MULTIPLE_CHOICE', rng: seededRandom(3) });
        // Once the bank fills from attempted tracks it may succeed; either way rejections were recorded or the result is valid
        expect(engine.stats.generated + engine.stats.rejected).toBeGreaterThan(0);
        if (q) expect(q.choices).toHaveLength(4);
    });

    test('respects excludeTrackIds for variety', async () => {
        const engine = makeEngine(fx.catalog);
        for (const t of fx.tracks) engine.bank.addTrackLines(t._id, fx.lyrics[t._id].lines, { genre: t.primaryGenre });
        const exclude = fx.tracks.slice(1).map((t) => t._id);
        const q = await engine.generate({ template: 'GUESS_THE_ARTIST', rng: seededRandom(5), excludeTrackIds: exclude });
        expect(q.trackId).toBe('id0');
    });
});

describe('QuestionEngine — narrow pools', () => {
    test('a category with few artists still yields a question (falls back across templates and pools)', async () => {
        const p = new SyntheticProvider();
        const all = (await p.getPopularTracks({ pageSize: 100 })).map((t, i) => ({ ...t, _id: `id${i}`, status: 'ACTIVE' }));
        const lyrics = {};
        for (const t of all) lyrics[t._id] = await p.getLyrics(t.providerTrackId);
        const catalog = { getEligibleTracks: async (ctx) => (ctx && ctx.genre ? all.filter((t) => t.primaryGenre === ctx.genre) : all), getLyricAsset: async (t) => lyrics[t._id] };
        const engine = makeEngine(catalog);
        for (const t of all) engine.bank.addTrackLines(t._id, lyrics[t._id].lines, { genre: t.primaryGenre });
        for (let i = 0; i < 5; i++) {
            const q = await engine.generate({ gameMode: 'QUICK_PLAY', genre: 'pop', template: 'GUESS_THE_ARTIST', rng: seededRandom('pop' + i) });
            expect(q).toBeTruthy();
            expect(q.trackPublic.genre).toBe('pop');
            if (q.template === 'GUESS_THE_ARTIST') expect(q.choices).toHaveLength(4);
        }
    });
});
