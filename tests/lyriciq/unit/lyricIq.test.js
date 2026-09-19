const { computeLyricIq, explainLyricIq } = require('../../../src/lyriciq/services/lyricIq/lyricIqService');
const { buildSharePayload } = require('../../../src/lyriciq/services/share/shareService');

describe('Lyric IQ model v1', () => {
    test('no data → null, provisional', () => {
        const r = computeLyricIq(null);
        expect(r.value).toBeNull();
        expect(r.provisional).toBe(true);
        expect(explainLyricIq(r)[0]).toMatch(/Play a session/);
    });
    test('is not a raw percentage and stays within 0–100', () => {
        const perfectSmall = computeLyricIq({ totals: { attempts: 3, correct: 3, sumDifficultyCorrect: 60 }, recentSessionAccuracies: [] });
        expect(perfectSmall.value).toBeLessThan(100);
        expect(perfectSmall.provisional).toBe(true);
        const terrible = computeLyricIq({ totals: { attempts: 50, correct: 0 }, recentSessionAccuracies: [0, 0, 0] });
        expect(terrible.value).toBeGreaterThanOrEqual(0);
    });
    test('more difficulty conquered and more breadth raise the score', () => {
        const base = { totals: { attempts: 40, correct: 30, sumDifficultyCorrect: 30 * 30, recallAttempts: 20, recallCorrect: 15 }, byGenre: { pop: { attempts: 40, correct: 30 } }, byDecade: { '2010s': { attempts: 40, correct: 30 } }, byArtist: { a: { attempts: 40, correct: 30 } }, recentSessionAccuracies: [0.75, 0.75, 0.75] };
        const harder = { ...base, totals: { ...base.totals, sumDifficultyCorrect: 30 * 70 } };
        const broader = { ...base, byGenre: { pop: { attempts: 10, correct: 8 }, rock: { attempts: 10, correct: 8 }, rnb: { attempts: 10, correct: 7 }, hiphop: { attempts: 10, correct: 7 } }, byArtist: Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['a' + i, { attempts: 2, correct: 1 }])) };
        expect(computeLyricIq(harder).value).toBeGreaterThan(computeLyricIq(base).value);
        expect(computeLyricIq(broader).value).toBeGreaterThan(computeLyricIq(base).value);
    });
    test('Artist IQ appears per artist past the sample threshold, with a readable label', () => {
        const r = computeLyricIq({ totals: { attempts: 30, correct: 20, sumDifficultyCorrect: 800 }, byArtist: { 'the-hollow-kings': { attempts: 16, correct: 12, sumDifficultyCorrect: 500 }, 'vera-solace': { attempts: 4, correct: 4, sumDifficultyCorrect: 100 }, unknown: { attempts: 20, correct: 20, sumDifficultyCorrect: 900 } } });
        expect(r.subScores.artists['the-hollow-kings'].value).toBeGreaterThan(0);
        expect(r.subScores.artists['the-hollow-kings'].label).toBe('The Hollow Kings IQ');
        expect(r.subScores.artists['vera-solace']).toBeUndefined();
        expect(r.subScores.artists.unknown).toBeUndefined();
    });
    test('category sub-scores appear only past the sample threshold', () => {
        const r = computeLyricIq({ totals: { attempts: 30, correct: 20, recognitionAttempts: 16, recognitionCorrect: 12, sumDifficultyCorrect: 800 }, byGenre: { pop: { attempts: 15, correct: 12, sumDifficultyCorrect: 500 }, rock: { attempts: 5, correct: 5, sumDifficultyCorrect: 200 } }, byDecade: { '1990s': { attempts: 15, correct: 10, sumDifficultyCorrect: 400 } } });
        expect(r.subScores.genres.pop.value).toBeGreaterThan(0);
        expect(r.subScores.genres.rock).toBeUndefined();
        expect(r.subScores.eras['1990s'].value).toBeGreaterThan(0);
        expect(r.subScores.recognition.value).toBeGreaterThan(0);
        expect(r.subScores.recall).toBeNull();
    });
    test('share payload reveals status, not lyrics', () => {
        const share = buildSharePayload({ lyricIq: { value: 87, provisional: false, subScores: { genres: { hiphop: { value: 92 } }, eras: {} } }, session: { gameMode: 'DAILY_10', correctCount: 8, wrongCount: 2, questionCount: 10 }, dailyStreak: 7 });
        expect(share.text).toContain('LYRIC IQ: 87');
        expect(share.text).toContain('HIP-HOP   92');
        expect(share.text).toContain('8/10');
        expect(share.text).toContain('7 DAY STREAK');
        expect(share.text).not.toMatch(/\[\[BLANK\]\]/);
    });
});
