'use strict';

const config = require('../../config');
const { normalizeText, isStopword, containsWholePhrase, tokenizeLine } = require('../../utilities/text');
const { extractUsableLines } = require('../../providers/lyrics/normalizeTrack');

const BLANK_MARKER = '[[BLANK]]';

/**
 * Validates a private (server-side) question object before it becomes playable.
 * Returns { valid, reasons } with machine-readable rejection reasons.
 *
 * Shape expected:
 * { template, answerType, prompt: { kind, lines }, answer: { canonical, accepted }, choices, choiceIndex,
 *   track, eligibility: { eligible, reason }, excerptLineCount }
 */
function validateQuestion(q) {
    const reasons = [];
    const push = (r) => { if (!reasons.includes(r)) reasons.push(r); };

    if (!q || typeof q !== 'object') return { valid: false, reasons: ['MALFORMED_QUESTION'] };

    // Prompt shape
    const lines = Array.isArray(q.prompt?.lines) ? q.prompt.lines : null;
    if (!lines || !lines.length || lines.some((l) => typeof l !== 'string' || !l.trim())) push('PROMPT_MALFORMED');
    if (q.prompt?.kind === 'BLANK' && lines && !lines.some((l) => l.includes(BLANK_MARKER))) push('PROMPT_MISSING_BLANK');
    if (q.prompt?.kind !== 'BLANK' && lines && lines.some((l) => l.includes(BLANK_MARKER))) push('PROMPT_MALFORMED');

    // Excerpt usability + content rules
    if (lines) {
        const maxLines = config.provider.musixmatch.maxExcerptLines;
        if (lines.length > maxLines) push('EXCERPT_TOO_LONG');
        for (const line of lines) {
            const visible = line.replace(BLANK_MARKER, '').trim();
            const words = tokenizeLine(visible).length;
            const total = tokenizeLine(line.replace(BLANK_MARKER, 'x')).length;
            if (total < 3 || total > 20) push('EXCERPT_UNUSABLE');
            if (q.prompt?.kind === 'BLANK' && line.includes(BLANK_MARKER) && words < 2) push('EXCERPT_UNUSABLE');
            if (extractUsableLines(line.replace(BLANK_MARKER, 'x')).length === 0) push('EXCERPT_UNUSABLE');
        }
    }

    // Answer
    const canonical = normalizeText(q.answer?.canonical);
    if (!canonical) push('ANSWER_EMPTY');
    if (canonical && lines) {
        const visibleText = lines.map((l) => l.replace(BLANK_MARKER, ' ')).join(' \n ');
        if (q.template !== 'NEXT_LINE' || true) {
            if (containsWholePhrase(visibleText, canonical)) push('ANSWER_IN_PROMPT');
        }
    }
    if (q.prompt?.kind === 'BLANK' && canonical) {
        const words = canonical.split(' ');
        if (words.every((w) => isStopword(w))) push('BLANK_TRIVIAL');
        if (canonical.length < config.blank.minWordLength) push('BLANK_TRIVIAL');
        if (q.answerType === 'TYPED' && words.length > 3) push('ANSWER_TOO_LONG_FOR_TYPED');
    }
    if (q.template === 'GUESS_THE_SONG' && canonical && lines && containsWholePhrase(lines.join(' '), canonical)) push('ANSWER_IN_PROMPT');
    if (q.template === 'GUESS_THE_ARTIST' && canonical && lines && containsWholePhrase(lines.join(' '), canonical)) push('ANSWER_IN_PROMPT');

    // Choices
    if (q.answerType === 'MULTIPLE_CHOICE') {
        const choices = Array.isArray(q.choices) ? q.choices : [];
        const expected = config.distractors.count + 1;
        if (choices.length !== expected) push('CHOICE_COUNT_INVALID');
        const norms = choices.map(normalizeText);
        if (norms.some((n) => !n)) push('CHOICE_EMPTY');
        const dupes = new Set();
        norms.forEach((n, i) => { if (norms.indexOf(n) !== i) dupes.add(n); });
        if (dupes.size) push('DISTRACTOR_DUPLICATE');
        const distractors = norms.filter((n, i) => i !== q.choiceIndex);
        if (distractors.some((n) => n === canonical)) push('DISTRACTOR_EQUALS_ANSWER');
        if (typeof q.choiceIndex !== 'number' || norms[q.choiceIndex] !== canonical) push('CHOICE_INDEX_INVALID');
        // Ambiguity: a distractor that also appears in the visible prompt is confusing.
        if (lines && q.prompt?.kind === 'BLANK') {
            const visibleText = lines.map((l) => l.replace(BLANK_MARKER, ' ')).join(' ');
            if (distractors.some((n) => n.length > 3 && containsWholePhrase(visibleText, n))) push('QUESTION_AMBIGUOUS');
        }
    } else if (q.answerType !== 'TYPED') {
        push('ANSWER_TYPE_INVALID');
    }

    // Track restrictions
    if (q.eligibility && q.eligibility.eligible === false) push('TRACK_RESTRICTED');
    if (!q.track) push('TRACK_MISSING');

    return { valid: reasons.length === 0, reasons };
}

module.exports = { validateQuestion, BLANK_MARKER };
