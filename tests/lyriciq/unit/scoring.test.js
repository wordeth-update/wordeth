const { scoreAnswer } = require('../../../src/lyriciq/services/scoring/scoringService');
const config = require('../../../src/lyriciq/config');

describe('scoring model v1', () => {
    test('base score for an easy, slow, streak-less correct answer', () => {
        const r = scoreAnswer({ correct: true, difficulty: 0, responseTimeMs: config.scoring.speedWindowMs, streakBefore: 0 });
        expect(r.points).toBe(config.scoring.baseScore);
        expect(r.modelVersion).toBe(1);
    });
    test('difficulty multiplies the base', () => {
        const easy = scoreAnswer({ correct: true, difficulty: 0, responseTimeMs: 10000 }).points;
        const elite = scoreAnswer({ correct: true, difficulty: 100, responseTimeMs: 10000 }).points;
        expect(elite).toBe(easy * config.scoring.difficultyMultiplierMax);
    });
    test('speed bonus is bounded and monotonic', () => {
        const fast = scoreAnswer({ correct: true, difficulty: 50, responseTimeMs: 0 });
        const mid = scoreAnswer({ correct: true, difficulty: 50, responseTimeMs: 5000 });
        const slow = scoreAnswer({ correct: true, difficulty: 50, responseTimeMs: 60000 });
        expect(fast.breakdown.speedBonus).toBe(config.scoring.speedBonusMax);
        expect(mid.breakdown.speedBonus).toBeLessThan(fast.breakdown.speedBonus);
        expect(slow.breakdown.speedBonus).toBe(0);
        // Sub-human response times cannot earn more than the cap
        expect(scoreAnswer({ correct: true, difficulty: 50, responseTimeMs: -5 }).breakdown.speedBonus).toBe(config.scoring.speedBonusMax);
    });
    test('streak bonus grows per step and caps', () => {
        expect(scoreAnswer({ correct: true, difficulty: 0, responseTimeMs: 10000, streakBefore: 3 }).breakdown.streakBonus).toBe(30);
        expect(scoreAnswer({ correct: true, difficulty: 0, responseTimeMs: 10000, streakBefore: 500 }).breakdown.streakBonus).toBe(config.scoring.streakBonusCap);
    });
    test('wrong or timed out answers score zero; maximum per question is enforced', () => {
        expect(scoreAnswer({ correct: false, difficulty: 100, responseTimeMs: 0, streakBefore: 10 }).points).toBe(0);
        expect(scoreAnswer({ correct: true, timedOut: true, difficulty: 100, responseTimeMs: 0 }).points).toBe(0);
        const max = scoreAnswer({ correct: true, difficulty: 100, responseTimeMs: 0, streakBefore: 99, answerType: 'TYPED' }).points;
        expect(max).toBeLessThanOrEqual(config.scoring.maxPointsPerQuestion);
        expect(scoreAnswer({ correct: true, difficulty: 50, responseTimeMs: 3000 }).points).toBeGreaterThan(0);
    });
    test('deterministic', () => {
        const a = scoreAnswer({ correct: true, difficulty: 37, responseTimeMs: 2200, streakBefore: 2 });
        const b = scoreAnswer({ correct: true, difficulty: 37, responseTimeMs: 2200, streakBefore: 2 });
        expect(a).toEqual(b);
    });
});
