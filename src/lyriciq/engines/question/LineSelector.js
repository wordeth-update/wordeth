'use strict';

const config = require('../../config');
const { tokenizeLine, normalizeText } = require('../../utilities/text');

/**
 * Filters a lyric asset's lines down to excerpts usable in a question and
 * annotates them with token data. Lines that are too short, too long,
 * duplicated, or mostly non-lexical (oh-oh-oh) are dropped.
 */
function selectCandidateLines(lines, { minWords = config.blank.minLineWords, maxWords = config.blank.maxLineWords } = {}) {
    const seen = new Set();
    const out = [];
    (lines || []).forEach((line, index) => {
        const tokens = tokenizeLine(line);
        if (tokens.length < minWords || tokens.length > maxWords) return;
        const norm = normalizeText(line);
        if (!norm || seen.has(norm)) return;
        const lexical = tokens.filter((t) => t.word.length >= 3).length;
        if (lexical / tokens.length < 0.5) return;
        seen.add(norm);
        out.push({ index, text: line, tokens, normalized: norm });
    });
    return out;
}

/** Word frequency across a track, used for uniqueness scoring. */
function wordFrequency(lines) {
    const freq = new Map();
    for (const line of lines || []) {
        for (const t of tokenizeLine(line)) freq.set(t.word, (freq.get(t.word) || 0) + 1);
    }
    return freq;
}

module.exports = { selectCandidateLines, wordFrequency };
