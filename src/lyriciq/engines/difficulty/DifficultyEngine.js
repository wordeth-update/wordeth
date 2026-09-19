'use strict';

const config = require('../../config');
const { normalizeText, rhymeKey } = require('../../utilities/text');

/**
 * Estimates a 0–100 difficulty for a generated question.
 * Inputs are the question template, answer format, hidden content size,
 * track popularity and how similar the distractors are to the answer.
 */
function estimateDifficulty({ template, answerType, answer, hiddenWordCount = 1, track = {}, choices = [], promptKind = 'BLANK' }) {
    const d = config.difficulty;
    let score = d.templateBase[template] ?? 30;
    if (answerType === 'TYPED') score += d.typedBonus;
    // Hidden-content size only matters when the player reconstructs the text itself.
    if (promptKind === 'BLANK') {
        score += d.perHiddenWord * Math.max(0, hiddenWordCount - 1);
        const answerLen = normalizeText(answer).length;
        score += Math.min(d.answerLengthCap, d.perAnswerCharOver6 * Math.max(0, answerLen - 6));
    }
    const popularity = Number.isFinite(track.popularity) ? track.popularity : 50;
    score += d.popularityWeight * (1 - popularity / 100);
    if (answerType === 'MULTIPLE_CHOICE' && choices.length > 1) {
        score += d.choiceSimilarityWeight * choiceSimilarity(answer, choices);
    }
    return clamp(Math.round(score));
}

/** 0–1: how much the distractors resemble the answer (length + rhyme). */
function choiceSimilarity(answer, choices) {
    const a = normalizeText(answer);
    const others = choices.map(normalizeText).filter((c) => c && c !== a);
    if (!others.length) return 0;
    const sims = others.map((c) => {
        const lengthSim = 1 - Math.abs(c.length - a.length) / Math.max(c.length, a.length, 1);
        const rhyme = rhymeKey(c.split(' ').pop()) === rhymeKey(a.split(' ').pop()) ? 1 : 0;
        return 0.6 * lengthSim + 0.4 * rhyme;
    });
    return sims.reduce((x, y) => x + y, 0) / sims.length;
}

function clamp(n) { return Math.max(0, Math.min(100, n)); }

function bandFor(difficulty) {
    for (const band of config.difficulty.bands) if (difficulty <= band.max) return band.label;
    return 'ELITE';
}

module.exports = { estimateDifficulty, bandFor, choiceSimilarity };
