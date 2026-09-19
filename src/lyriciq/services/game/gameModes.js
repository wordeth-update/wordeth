'use strict';

const config = require('../../config');

/**
 * Game mode definitions: how many questions, which templates, answer formats
 * and difficulty progression. Everything else about a mode is the question
 * engine's job.
 */
const TEMPLATE_WEIGHTS = {
    QUICK_PLAY: { MISSING_WORD: 3, FINISH_THE_LYRIC: 3, GUESS_THE_SONG: 2, GUESS_THE_ARTIST: 2, NEXT_LINE: 2, MISSING_PHRASE: 1 },
    RAPID_FIRE: { MISSING_WORD: 3, FINISH_THE_LYRIC: 3, GUESS_THE_SONG: 2, GUESS_THE_ARTIST: 2 },
    STREAK: { MISSING_WORD: 3, FINISH_THE_LYRIC: 3, GUESS_THE_SONG: 2, GUESS_THE_ARTIST: 2, NEXT_LINE: 2, MISSING_PHRASE: 1 }
};

/** Fixed, auditable template sequence for Daily 10. */
const DAILY_SEQUENCE = [
    { template: 'GUESS_THE_ARTIST', answerType: 'MULTIPLE_CHOICE' },
    { template: 'MISSING_WORD', answerType: 'MULTIPLE_CHOICE' },
    { template: 'FINISH_THE_LYRIC', answerType: 'MULTIPLE_CHOICE' },
    { template: 'GUESS_THE_SONG', answerType: 'MULTIPLE_CHOICE' },
    { template: 'MISSING_WORD', answerType: 'MULTIPLE_CHOICE' },
    { template: 'NEXT_LINE', answerType: 'MULTIPLE_CHOICE' },
    { template: 'FINISH_THE_LYRIC', answerType: 'TYPED' },
    { template: 'MISSING_PHRASE', answerType: 'MULTIPLE_CHOICE' },
    { template: 'GUESS_THE_SONG', answerType: 'MULTIPLE_CHOICE' },
    { template: 'MISSING_WORD', answerType: 'TYPED' }
];

const TYPED_ELIGIBLE = new Set(['MISSING_WORD', 'FINISH_THE_LYRIC']);

function getModeDefinition(mode) {
    return config.modes[mode] || null;
}

function isValidMode(mode) {
    return Boolean(config.modes[mode]);
}

function weightedPick(weights, rng) {
    const entries = Object.entries(weights);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let r = rng() * total;
    for (const [key, w] of entries) { r -= w; if (r <= 0) return key; }
    return entries[entries.length - 1][0];
}

/**
 * Decide the template / answer type / target difficulty for the next question.
 * @param opts { gameMode, questionIndex, currentStreak, typedAnswersEnabled, rng }
 */
function planNextQuestion({ gameMode, questionIndex = 0, currentStreak = 0, typedAnswersEnabled = true, rng = Math.random }) {
    if (gameMode === 'DAILY_10') {
        const spec = DAILY_SEQUENCE[questionIndex % DAILY_SEQUENCE.length];
        return { template: spec.template, answerType: typedAnswersEnabled ? spec.answerType : 'MULTIPLE_CHOICE', targetDifficulty: null };
    }
    const template = weightedPick(TEMPLATE_WEIGHTS[gameMode] || TEMPLATE_WEIGHTS.QUICK_PLAY, rng);
    let answerType = 'MULTIPLE_CHOICE';
    let targetDifficulty = null;

    if (gameMode === 'QUICK_PLAY' && typedAnswersEnabled && questionIndex >= 2 && TYPED_ELIGIBLE.has(template) && rng() < 0.2) {
        answerType = 'TYPED';
    }
    if (gameMode === 'STREAK') {
        targetDifficulty = Math.min(95, 15 + currentStreak * 6);
        if (typedAnswersEnabled && currentStreak >= 8 && TYPED_ELIGIBLE.has(template) && rng() < 0.35) answerType = 'TYPED';
    }
    return { template, answerType, targetDifficulty };
}

module.exports = { getModeDefinition, isValidMode, planNextQuestion, DAILY_SEQUENCE, TEMPLATE_WEIGHTS };
