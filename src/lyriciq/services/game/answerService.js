'use strict';

const config = require('../../config');
const { normalizeText, editDistance } = require('../../utilities/text');

/**
 * Evaluates a submission against a question's private answer key.
 *
 * Typed answers are normalised (case, whitespace, punctuation, apostrophes,
 * Unicode) and compared to the accepted forms. A small, length-scaled edit
 * distance tolerance catches typos without accepting materially different
 * words; a submission that exactly matches a distractor is never accepted.
 */
function evaluateAnswer({ answerType, answerKey, choices = [] }, submission = {}) {
    const canonical = answerKey.canonical;
    const accepted = (answerKey.accepted && answerKey.accepted.length ? answerKey.accepted : [normalizeText(canonical)]).map(normalizeText);

    if (answerType === 'MULTIPLE_CHOICE') {
        let choiceIndex = submission.choiceIndex;
        if (!Number.isInteger(choiceIndex) && typeof submission.answer === 'string') {
            const norm = normalizeText(submission.answer);
            choiceIndex = choices.findIndex((c) => normalizeText(c) === norm);
        }
        const valid = Number.isInteger(choiceIndex) && choiceIndex >= 0 && choiceIndex < choices.length;
        const correct = valid && choiceIndex === answerKey.choiceIndex;
        return {
            correct,
            canonicalAnswer: canonical,
            normalizedInput: valid ? normalizeText(choices[choiceIndex]) : '',
            choiceIndex: valid ? choiceIndex : null,
            matchType: correct ? 'CHOICE' : 'NONE'
        };
    }

    const raw = typeof submission.answer === 'string' ? submission.answer.slice(0, config.answers.maxAnswerLength) : '';
    const normalizedInput = normalizeText(raw);
    if (!normalizedInput) {
        return { correct: false, canonicalAnswer: canonical, normalizedInput: '', choiceIndex: null, matchType: 'EMPTY' };
    }
    if (accepted.includes(normalizedInput)) {
        return { correct: true, canonicalAnswer: canonical, normalizedInput, choiceIndex: null, matchType: 'EXACT' };
    }
    const distractorNorms = choices.map(normalizeText).filter((c) => !accepted.includes(c));
    if (distractorNorms.includes(normalizedInput)) {
        return { correct: false, canonicalAnswer: canonical, normalizedInput, choiceIndex: null, matchType: 'NONE' };
    }
    const tolerance = toleranceFor(accepted[0]);
    const fuzzy = tolerance > 0 && accepted.some((a) => Math.abs(a.length - normalizedInput.length) <= tolerance && editDistance(a, normalizedInput) <= tolerance);
    return { correct: fuzzy, canonicalAnswer: canonical, normalizedInput, choiceIndex: null, matchType: fuzzy ? 'FUZZY' : 'NONE' };
}

function toleranceFor(answer) {
    const len = (answer || '').replace(/\s/g, '').length;
    for (const rule of config.answers.allowedEditDistanceByLength) {
        if (len <= rule.maxLength) return rule.distance;
    }
    return 0;
}

module.exports = { evaluateAnswer, toleranceFor };
