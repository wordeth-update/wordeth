'use strict';

const config = require('../../config');

/**
 * Scoring model v1 (config.scoring.modelVersion).
 *
 *   points = base × difficultyMultiplier × accuracy + speedBonus + streakBonus
 *   recall questions answered by typing earn typedRecallMultiplier on the base.
 *
 * Deterministic: same inputs → same output. Every input is persisted on the
 * AnswerAttempt so later model versions can be recomputed.
 */
function scoreAnswer({ correct, difficulty, responseTimeMs, streakBefore = 0, answerType = 'MULTIPLE_CHOICE', timedOut = false }) {
    const s = config.scoring;
    const breakdown = { base: 0, difficultyMultiplier: 1, speedBonus: 0, streakBonus: 0, typedMultiplier: 1 };
    if (!correct || timedOut) {
        return { points: 0, breakdown, modelVersion: s.modelVersion };
    }
    const d = clamp(Number(difficulty) || 0, 0, 100);
    breakdown.difficultyMultiplier = s.difficultyMultiplierMin + (s.difficultyMultiplierMax - s.difficultyMultiplierMin) * (d / 100);
    breakdown.typedMultiplier = answerType === 'TYPED' ? s.typedRecallMultiplier : 1;
    breakdown.base = s.baseScore * breakdown.difficultyMultiplier * breakdown.typedMultiplier;

    const rtRaw = Number.isFinite(Number(responseTimeMs)) ? Number(responseTimeMs) : s.speedWindowMs;
    const rt = clamp(rtRaw, s.minCountedResponseMs, s.speedWindowMs);
    breakdown.speedBonus = s.speedBonusMax * (1 - (rt - s.minCountedResponseMs) / (s.speedWindowMs - s.minCountedResponseMs));

    breakdown.streakBonus = Math.min(s.streakBonusCap, Math.max(0, streakBefore) * s.streakBonusPerStep);

    const points = Math.min(s.maxPointsPerQuestion, Math.round(breakdown.base + breakdown.speedBonus + breakdown.streakBonus));
    return { points, breakdown, modelVersion: s.modelVersion };
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

module.exports = { scoreAnswer };
