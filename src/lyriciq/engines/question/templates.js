'use strict';

const { selectBlank } = require('./BlankSelector');
const { BLANK_MARKER } = require('../validation/QuestionValidator');

/**
 * Question templates. Each `build` receives a context and returns the raw
 * pieces the QuestionEngine assembles: prompt lines, the answer, what kind of
 * distractors are needed and how many words are hidden. Builders are pure and
 * synchronous; all randomness flows through `ctx.rng`.
 *
 * ctx = { track, lines (candidate line objects), allLines, wordFreq, rng, answerType, pool (tracks) }
 */

const RECALL = 'RECALL';
const RECOGNITION = 'RECOGNITION';

function rawSlice(tokens, start, length) {
    return tokens.slice(start, start + length).map((t) => t.raw.replace(/[^\p{L}\p{N}'-]/gu, '')).join(' ');
}

function lineWithBlank(tokens, start, length) {
    const parts = tokens.map((t) => t.raw);
    parts.splice(start, length, BLANK_MARKER);
    return parts.join(' ').replace(/\s+([,.!?;:])/g, '$1');
}

function pickLine(ctx, predicate = () => true) {
    const options = ctx.lines.filter(predicate);
    if (!options.length) return null;
    return options[Math.floor(ctx.rng() * options.length)];
}

function previousLine(ctx, line) {
    if (!line || line.index === 0) return null;
    const prev = ctx.allLines[line.index - 1];
    if (!prev || prev.trim() === line.text.trim()) return null;
    return prev;
}

const templates = {
    FINISH_THE_LYRIC: {
        key: 'FINISH_THE_LYRIC', name: 'Finish the Lyric', skill: RECALL,
        answerTypes: ['MULTIPLE_CHOICE', 'TYPED'],
        instruction: 'Finish the line.',
        build(ctx) {
            const line = pickLine(ctx);
            if (!line) return null;
            const blank = selectBlank(line.tokens, { mode: 'end', rng: ctx.rng, wordFreq: ctx.wordFreq });
            if (!blank) return null;
            const prev = previousLine(ctx, line);
            const lines = prev ? [prev, lineWithBlank(line.tokens, blank.start, blank.length)] : [lineWithBlank(line.tokens, blank.start, blank.length)];
            return {
                promptKind: 'BLANK', lines, answer: rawSlice(line.tokens, blank.start, blank.length),
                hiddenWordCount: blank.length, distractorKind: blank.length > 1 ? 'phrase' : 'word', sourceLine: line
            };
        }
    },
    MISSING_WORD: {
        key: 'MISSING_WORD', name: 'Missing Word', skill: RECALL,
        answerTypes: ['MULTIPLE_CHOICE', 'TYPED'],
        instruction: 'Fill in the missing word.',
        build(ctx) {
            const line = pickLine(ctx);
            if (!line) return null;
            const blank = selectBlank(line.tokens, { mode: 'word', rng: ctx.rng, wordFreq: ctx.wordFreq });
            if (!blank) return null;
            return {
                promptKind: 'BLANK', lines: [lineWithBlank(line.tokens, blank.start, 1)], answer: rawSlice(line.tokens, blank.start, 1),
                hiddenWordCount: 1, distractorKind: 'word', sourceLine: line
            };
        }
    },
    MISSING_PHRASE: {
        key: 'MISSING_PHRASE', name: 'Missing Phrase', skill: RECALL,
        answerTypes: ['MULTIPLE_CHOICE', 'TYPED'],
        instruction: 'Fill in the missing phrase.',
        build(ctx) {
            const line = pickLine(ctx, (l) => l.tokens.length >= 6);
            if (!line) return null;
            const blank = selectBlank(line.tokens, { mode: 'phrase', rng: ctx.rng, wordFreq: ctx.wordFreq });
            if (!blank) return null;
            return {
                promptKind: 'BLANK', lines: [lineWithBlank(line.tokens, blank.start, blank.length)], answer: rawSlice(line.tokens, blank.start, blank.length),
                hiddenWordCount: blank.length, distractorKind: 'phrase', sourceLine: line
            };
        }
    },
    NEXT_LINE: {
        key: 'NEXT_LINE', name: 'Next Line', skill: RECALL,
        answerTypes: ['MULTIPLE_CHOICE'],
        instruction: 'What comes next?',
        build(ctx) {
            const byIndex = new Map(ctx.lines.map((l) => [l.index, l]));
            const line = pickLine(ctx, (l) => byIndex.has(l.index + 1));
            if (!line) return null;
            const next = byIndex.get(line.index + 1);
            return {
                promptKind: 'EXCERPT', lines: [line.text], answer: next.text,
                hiddenWordCount: next.tokens.length, distractorKind: 'line', sourceLine: line, answerLine: next
            };
        }
    },
    GUESS_THE_SONG: {
        key: 'GUESS_THE_SONG', name: 'Guess the Song', skill: RECOGNITION,
        answerTypes: ['MULTIPLE_CHOICE'],
        instruction: 'Which song is this?',
        build(ctx) {
            const line = pickLine(ctx);
            if (!line) return null;
            const prev = previousLine(ctx, line);
            return {
                promptKind: 'EXCERPT', lines: prev ? [prev, line.text] : [line.text], answer: ctx.track.title,
                hiddenWordCount: 1, distractorKind: 'title', sourceLine: line
            };
        }
    },
    GUESS_THE_ARTIST: {
        key: 'GUESS_THE_ARTIST', name: 'Guess the Artist', skill: RECOGNITION,
        answerTypes: ['MULTIPLE_CHOICE'],
        instruction: 'Who performs this?',
        build(ctx) {
            const line = pickLine(ctx);
            if (!line) return null;
            const prev = previousLine(ctx, line);
            return {
                promptKind: 'EXCERPT', lines: prev ? [prev, line.text] : [line.text], answer: ctx.track.artist,
                hiddenWordCount: 1, distractorKind: 'artist', sourceLine: line
            };
        }
    }
};

const TEMPLATE_KEYS = Object.keys(templates);

module.exports = { templates, TEMPLATE_KEYS, BLANK_MARKER };
