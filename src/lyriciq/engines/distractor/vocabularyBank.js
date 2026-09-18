'use strict';

const { tokenizeLine, isStopword, rhymeKey, guessPartOfSpeech, normalizeText } = require('../../utilities/text');

/**
 * In-memory pool of words and lines the distractor engine draws from.
 * Populated as lyric assets pass through the question engine. Holds words and
 * single lines only (never full bodies) and is bounded in size.
 */
class VocabularyBank {
    constructor({ maxWords = 20000, maxLinesPerTrack = 40, maxTracks = 400 } = {}) {
        this.words = new Map();      // norm → { raw, len, rhyme, pos, stop, tracks:Set, genres:Set }
        this.lines = new Map();      // trackId → [{ text, norm, len, genre }]
        this.maxWords = maxWords;
        this.maxLinesPerTrack = maxLinesPerTrack;
        this.maxTracks = maxTracks;
    }

    addTrackLines(trackId, lines, { genre = 'other' } = {}) {
        const id = String(trackId);
        if (this.lines.has(id)) return;
        if (this.lines.size >= this.maxTracks) {
            const oldest = this.lines.keys().next().value;
            this.lines.delete(oldest);
        }
        const entries = [];
        for (const line of (lines || []).slice(0, this.maxLinesPerTrack)) {
            const tokens = tokenizeLine(line);
            if (tokens.length < 3) continue;
            entries.push({ text: line, norm: normalizeText(line), len: tokens.length, genre, trackId: id });
            for (const t of tokens) {
                if (t.word.length < 3 || /\d/.test(t.word)) continue;
                let rec = this.words.get(t.word);
                if (!rec) {
                    if (this.words.size >= this.maxWords) continue;
                    rec = { raw: t.raw.replace(/[^\p{L}\p{N}'-]/gu, ''), norm: t.word, len: t.word.length, rhyme: rhymeKey(t.word), pos: guessPartOfSpeech(t.word), stop: isStopword(t.word), tracks: new Set(), genres: new Set() };
                    this.words.set(t.word, rec);
                }
                rec.tracks.add(id);
                rec.genres.add(genre);
            }
        }
        this.lines.set(id, entries);
    }

    wordRecords() { return Array.from(this.words.values()); }
    linesFor(trackId) { return this.lines.get(String(trackId)) || []; }
    otherLines(trackId) {
        const out = [];
        for (const [id, entries] of this.lines) if (id !== String(trackId)) out.push(...entries);
        return out;
    }
    clear() { this.words.clear(); this.lines.clear(); }
}

const shared = new VocabularyBank();

module.exports = { VocabularyBank, bank: shared };
