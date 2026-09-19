const { DistractorEngine } = require('../../../src/lyriciq/engines/distractor/DistractorEngine');
const { VocabularyBank } = require('../../../src/lyriciq/engines/distractor/vocabularyBank');
const { normalizeText, isStopword } = require('../../../src/lyriciq/utilities/text');
const catalog = require('../../../src/lyriciq/fixtures/syntheticCatalog');

function warmBank() {
    const bank = new VocabularyBank();
    catalog.tracks.forEach((t) => bank.addTrackLines(t.providerTrackId, t.lines, { genre: t.genre }));
    return bank;
}

describe('DistractorEngine', () => {
    const bank = warmBank();
    const engine = new DistractorEngine({ bank });
    const rng = () => 0.42;

    test('word distractors are unique, non-stopword, never the answer and not visible in the prompt', () => {
        const out = engine.wordDistractors({ answer: 'rooftop', visibleText: 'We were dancing on the [[BLANK]] in the rain', trackId: 'syn-0001', genre: 'pop', rng });
        expect(out).toHaveLength(3);
        const norms = out.map(normalizeText);
        expect(new Set(norms).size).toBe(3);
        expect(norms).not.toContain('rooftop');
        expect(norms.some(isStopword)).toBe(false);
        for (const n of norms) expect('we were dancing on the in the rain'.split(' ')).not.toContain(n);
    });
    test('phrase distractors match the hidden word count', () => {
        const out = engine.phraseDistractors({ answer: 'golden ticket', wordCount: 2, visibleText: 'Running through the alley with a [[BLANK]]', trackId: 'syn-0002', rng });
        expect(out.length).toBe(3);
        out.forEach((p) => expect(p.split(' ')).toHaveLength(2));
        expect(out.map(normalizeText)).not.toContain('golden ticket');
    });
    test('line distractors prefer the same track and exclude the answer/prompt lines', () => {
        const out = engine.lineDistractors({ answerLine: 'Every streetlight learns my name', promptLine: 'Walking through the city tonight', trackId: 'syn-0001', genre: 'pop', rng });
        expect(out).toHaveLength(3);
        expect(out).not.toContain('Every streetlight learns my name');
        expect(out).not.toContain('Walking through the city tonight');
    });
    test('metadata distractors come from other tracks, same genre first', () => {
        const tracks = catalog.tracks.map((t) => ({ title: t.title, artist: t.artist, artistKey: t.artist.toLowerCase().replace(/\s+/g, '-'), primaryGenre: t.genre, popularity: t.popularity }));
        const titles = engine.metadataDistractors({ field: 'title', answer: 'Neon Rooftop', tracks, genre: 'pop', excludeArtistKey: 'vera-solace', rng });
        expect(titles).toHaveLength(3);
        expect(titles).not.toContain('Neon Rooftop');
        expect(titles).not.toContain('Glass Shoulders'); // same artist excluded
        const artists = engine.metadataDistractors({ field: 'artist', answer: 'Vera Solace', tracks, genre: 'pop', rng });
        expect(new Set(artists).size).toBe(3);
        expect(artists).not.toContain('Vera Solace');
    });
    test('an empty bank yields fewer than three distractors (engine must reject the question)', () => {
        const empty = new DistractorEngine({ bank: new VocabularyBank() });
        expect(empty.wordDistractors({ answer: 'rooftop', rng }).length).toBeLessThan(3);
    });
});
