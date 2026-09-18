const { estimateDifficulty, bandFor } = require('../../../src/lyriciq/engines/difficulty/DifficultyEngine');

describe('DifficultyEngine', () => {
    test('always returns an integer within 0–100', () => {
        const cases = [
            { template: 'GUESS_THE_ARTIST', answerType: 'MULTIPLE_CHOICE', answer: 'x', track: { popularity: 100 } },
            { template: 'MISSING_PHRASE', answerType: 'TYPED', answer: 'a very long hidden phrase indeed', hiddenWordCount: 6, track: { popularity: 0 }, choices: [] },
            { template: 'NEXT_LINE', answerType: 'MULTIPLE_CHOICE', answer: 'a full line of lyric text goes here', hiddenWordCount: 8, track: {}, promptKind: 'EXCERPT' },
            { template: 'UNKNOWN', answerType: 'MULTIPLE_CHOICE', answer: '' }
        ];
        for (const c of cases) {
            const d = estimateDifficulty(c);
            expect(Number.isInteger(d)).toBe(true);
            expect(d).toBeGreaterThanOrEqual(0);
            expect(d).toBeLessThanOrEqual(100);
        }
    });
    test('typed is harder than multiple choice; phrases harder than words; obscure harder than popular', () => {
        const mc = estimateDifficulty({ template: 'MISSING_WORD', answerType: 'MULTIPLE_CHOICE', answer: 'city', track: { popularity: 80 } });
        const typed = estimateDifficulty({ template: 'MISSING_WORD', answerType: 'TYPED', answer: 'city', track: { popularity: 80 } });
        const phrase = estimateDifficulty({ template: 'MISSING_PHRASE', answerType: 'MULTIPLE_CHOICE', answer: 'golden ticket', hiddenWordCount: 2, track: { popularity: 80 } });
        const obscure = estimateDifficulty({ template: 'MISSING_WORD', answerType: 'MULTIPLE_CHOICE', answer: 'city', track: { popularity: 10 } });
        expect(typed).toBeGreaterThan(mc);
        expect(phrase).toBeGreaterThan(mc);
        expect(obscure).toBeGreaterThan(mc);
    });
    test('bands map the 0–100 scale', () => {
        expect(bandFor(0)).toBe('EASY'); expect(bandFor(24)).toBe('EASY');
        expect(bandFor(25)).toBe('MEDIUM'); expect(bandFor(49)).toBe('MEDIUM');
        expect(bandFor(50)).toBe('HARD'); expect(bandFor(74)).toBe('HARD');
        expect(bandFor(75)).toBe('ELITE'); expect(bandFor(100)).toBe('ELITE');
    });
});
