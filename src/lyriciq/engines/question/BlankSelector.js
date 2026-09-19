'use strict';

const config = require('../../config');
const { isStopword, guessPartOfSpeech } = require('../../utilities/text');

/**
 * Scores blank candidates in a tokenised line and returns the best one.
 *
 * BlankQuality =
 *   semanticImportance + memorability + rhymeImportance + phraseUniqueness
 *   + linePositionWeight - stopwordPenalty - ambiguityPenalty
 *
 * All weights come from config.blank.weights.
 */

function scoreWord(token, position, tokens, wordFreq) {
    const w = config.blank.weights;
    const word = token.word;
    const len = word.length;
    const isLast = position === tokens.length - 1;
    const pos = guessPartOfSpeech(word);
    const stop = isStopword(word);

    let semantic = 0;
    if (!stop) semantic += 0.6;
    if (len >= 5) semantic += 0.3;
    if (['NOUN', 'VERB', 'ADJ'].includes(pos)) semantic += 0.4;

    let memorability = 0;
    if (position > 0 && /^[A-Z]/.test(token.raw)) memorability += 0.4; // proper noun mid-line
    if (len >= 4 && len <= 9) memorability += 0.3;

    const rhyme = isLast ? 1 : 0;
    const freq = wordFreq ? (wordFreq.get(word) || 1) : 1;
    const uniqueness = 1 / freq;
    const linePosition = tokens.length > 1 ? position / (tokens.length - 1) : 0;

    let ambiguity = 0;
    if (len < config.blank.minWordLength) ambiguity += 1;
    if (/\d/.test(word)) ambiguity += 0.5;
    // Same word visible elsewhere in the line → the answer would leak.
    if (tokens.some((t, i) => i !== position && t.word === word)) ambiguity += 1;

    const score = w.semanticImportance * semantic
        + w.memorability * memorability
        + w.rhymeImportance * rhyme
        + w.phraseUniqueness * uniqueness
        + w.linePosition * linePosition
        - w.stopwordPenalty * (stop ? 1 : 0)
        - w.ambiguityPenalty * ambiguity;

    return { score, stop, ambiguity, pos };
}

/**
 * @param tokens   tokenised line
 * @param options  { mode: 'word'|'phrase'|'end', rng, wordFreq }
 * @returns { start, length, tokens, score } or null
 */
function selectBlank(tokens, { mode = 'word', rng = Math.random, wordFreq = null } = {}) {
    if (!tokens || tokens.length < config.blank.minLineWords) return null;
    const wordScores = tokens.map((t, i) => scoreWord(t, i, tokens, wordFreq));
    let candidates = [];

    if (mode === 'word') {
        candidates = tokens.map((t, i) => ({ start: i, length: 1, score: wordScores[i].score, stop: wordScores[i].stop }));
    } else if (mode === 'end') {
        // Finish the lyric: hide the final 1–2 words, but never end on a bare stopword.
        const last = tokens.length - 1;
        candidates.push({ start: last, length: 1, score: wordScores[last].score, stop: wordScores[last].stop });
        if (tokens.length >= 6 && !wordScores[last - 1].stop && !wordScores[last].stop) {
            const twoScore = (wordScores[last].score + wordScores[last - 1].score) / 2 + 0.3;
            candidates.push({ start: last - 1, length: 2, score: twoScore, stop: false });
        }
    } else if (mode === 'phrase') {
        const { phraseMinWords, phraseMaxWords } = config.blank;
        for (let len = phraseMinWords; len <= phraseMaxWords; len++) {
            for (let start = 0; start + len <= tokens.length; start++) {
                // keep at least one visible word on either side when possible
                if (tokens.length - len < 2) continue;
                const slice = wordScores.slice(start, start + len);
                const contentWords = slice.filter((s) => !s.stop).length;
                if (contentWords === 0) continue;
                const mean = slice.reduce((a, s) => a + s.score, 0) / len;
                const boundaryPenalty = (slice[0].stop ? 0.6 : 0) + (slice[len - 1].stop ? 0.6 : 0);
                candidates.push({ start, length: len, score: mean + 0.4 * contentWords - boundaryPenalty, stop: contentWords === 0 });
            }
        }
    }

    candidates = candidates.filter((c) => !c.stop && c.score > 0);
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);

    // Weighted pick among the top three so repeat plays vary without sacrificing quality.
    const top = candidates.slice(0, 3);
    const weights = top.map((c, i) => [0.6, 0.28, 0.12][i]);
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let chosen = top[0];
    for (let i = 0; i < top.length; i++) { r -= weights[i]; if (r <= 0) { chosen = top[i]; break; } }
    return { ...chosen, tokens: tokens.slice(chosen.start, chosen.start + chosen.length) };
}

module.exports = { selectBlank, scoreWord };
