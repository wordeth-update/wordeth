'use strict';

/**
 * Text utilities shared by the question, distractor and answer engines.
 * Pure functions — no I/O.
 */

const STOPWORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'for', 'with', 'in', 'on', 'at', 'by', 'is', 'it', 'its',
    'be', 'as', 'so', 'if', 'i', 'im', "i'm", 'you', 'your', 'me', 'my', 'we', 'our', 'he', 'she', 'they', 'them',
    'this', 'that', 'these', 'those', 'am', 'are', 'was', 'were', 'do', 'did', 'does', 'not', 'no', 'yes', 'up',
    'down', 'out', 'off', 'oh', 'ooh', 'yeah', 'uh', 'ah', 'hey', 'la', 'na', 'da', 'ya', 'gonna', 'wanna', 'gotta',
    'just', 'like', 'get', 'got', 'can', 'cant', "can't", 'will', 'wont', "won't", 'dont', "don't", 'aint', "ain't",
    'from', 'into', 'than', 'then', 'there', 'here', 'what', 'when', 'where', 'who', 'how', 'all', 'too', 'very',
    'every', 'each', 'some', 'any', 'nobody', 'somebody', 'everybody', 'anybody', 'never', 'always', 'still', 'only'
]);

const APOSTROPHES = /[‘’‚‛′‵`´]/g;
const QUOTES = /[“”„‟″‶]/g;
const PUNCTUATION = /[^\p{L}\p{N}\s']/gu;

/** Canonical form for comparing answers: NFKC, lowercase, punctuation stripped, spaces collapsed. */
function normalizeText(input) {
    if (input === null || input === undefined) return '';
    return String(input)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFKC')
        .replace(APOSTROPHES, "'")
        .replace(QUOTES, '"')
        .toLowerCase()
        .replace(PUNCTUATION, ' ')
        .replace(/'/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Split a line into display tokens, preserving original spelling for prompts. */
function tokenizeLine(line) {
    return String(line || '')
        .replace(APOSTROPHES, "'")
        .split(/\s+/)
        .map((raw) => ({ raw, word: normalizeText(raw) }))
        .filter((t) => t.word.length > 0);
}

function isStopword(word) {
    return STOPWORDS.has(normalizeText(word));
}

/** Crude rhyme key: last vowel cluster + trailing consonants of the normalised word. */
function rhymeKey(word) {
    const w = normalizeText(word).replace(/\s+/g, '');
    if (!w) return '';
    const m = w.match(/[aeiouy]+[^aeiouy]*$/);
    return m ? m[0] : w.slice(-2);
}

/**
 * Heuristic part-of-speech class. This is intentionally simple; the
 * DistractorEngine treats it as a pluggable signal so a real tagger can
 * replace it later without touching callers.
 */
function guessPartOfSpeech(word) {
    const w = normalizeText(word);
    if (!w) return 'UNKNOWN';
    if (/ly$/.test(w) && w.length > 4) return 'ADV';
    if (/(ing|ed)$/.test(w) && w.length > 4) return 'VERB';
    if (/(tion|ness|ment|ship|ity|ance|ence|er|or|ist)$/.test(w) && w.length > 4) return 'NOUN';
    if (/(ful|less|ous|ive|able|ible|al|ic|est)$/.test(w) && w.length > 4) return 'ADJ';
    if (/s$/.test(w) && w.length > 3) return 'NOUN';
    return 'OTHER';
}

/** Damerau-free Levenshtein distance. */
function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

function countWords(text) {
    return normalizeText(text).split(' ').filter(Boolean).length;
}

/** True when the normalised needle appears as a whole-word sequence in haystack. */
function containsWholePhrase(haystack, needle) {
    const h = ` ${normalizeText(haystack)} `;
    const n = ` ${normalizeText(needle)} `;
    return n.trim().length > 0 && h.includes(n);
}

function decadeOf(year) {
    if (!year || !Number.isFinite(Number(year))) return null;
    return `${Math.floor(Number(year) / 10) * 10}s`;
}

module.exports = {
    STOPWORDS,
    normalizeText,
    tokenizeLine,
    isStopword,
    rhymeKey,
    guessPartOfSpeech,
    editDistance,
    countWords,
    containsWholePhrase,
    decadeOf
};
