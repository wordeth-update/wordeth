'use strict';

const config = require('../../config');
const { normalizeText, rhymeKey, guessPartOfSpeech, isStopword, editDistance, tokenizeLine } = require('../../utilities/text');
const { bank: sharedBank } = require('./vocabularyBank');

/**
 * Generates plausible wrong answers.
 *
 * Deterministic heuristics for the MVP; each generator is an independent
 * function so a semantic/phonetic model can replace the candidate scoring
 * without changing the QuestionEngine contract.
 */
class DistractorEngine {
    constructor({ bank = sharedBank, count = config.distractors.count, weights = config.distractors.weights } = {}) {
        this.bank = bank;
        this.count = count;
        this.weights = weights;
    }

    /** Wrong words for a single hidden word. */
    wordDistractors({ answer, visibleText = '', trackId = null, genre = null, rng = Math.random, count = this.count }) {
        const target = normalizeText(answer);
        const targetRhyme = rhymeKey(target);
        const targetPos = guessPartOfSpeech(target);
        const visible = new Set(tokenizeLine(visibleText).map((t) => t.word));
        const w = this.weights;

        const scored = [];
        for (const rec of this.bank.wordRecords()) {
            if (rec.stop || rec.norm === target || visible.has(rec.norm)) continue;
            if (editDistance(rec.norm, target) <= 1) continue; // near-identical spellings are unfair
            if (target.length >= 4 && (rec.norm.startsWith(target) || target.startsWith(rec.norm))) continue;
            const lengthSim = 1 - Math.abs(rec.len - target.length) / Math.max(rec.len, target.length);
            const rhyme = rec.rhyme === targetRhyme ? 1 : (rec.norm.slice(-1) === target.slice(-1) ? 0.35 : 0);
            const pos = rec.pos === targetPos ? 1 : 0;
            const sameTrack = trackId && rec.tracks.has(String(trackId)) ? 1 : 0;
            const sameGenre = genre && rec.genres.has(genre) ? 1 : 0;
            const score = w.lengthSimilarity * lengthSim + w.rhyme * rhyme + w.partOfSpeech * pos + w.sameTrackBonus * sameTrack + w.sameGenreBonus * sameGenre;
            scored.push({ text: rec.raw || rec.norm, norm: rec.norm, score });
        }
        return this._pick(scored, count, rng);
    }

    /** Wrong phrases of the same word length as a hidden phrase. */
    phraseDistractors({ answer, wordCount, visibleText = '', trackId = null, rng = Math.random, count = this.count }) {
        const target = normalizeText(answer);
        const visibleNorm = normalizeText(visibleText);
        const candidates = new Map();
        const consider = (lines, bonus) => {
            for (const line of lines) {
                const tokens = tokenizeLine(line.text);
                for (let s = 0; s + wordCount <= tokens.length; s++) {
                    const slice = tokens.slice(s, s + wordCount);
                    const norm = slice.map((t) => t.word).join(' ');
                    if (norm === target || candidates.has(norm) || visibleNorm.includes(norm)) continue;
                    if (slice.every((t) => isStopword(t.word))) continue;
                    if (isStopword(slice[0].word) || isStopword(slice[slice.length - 1].word)) continue;
                    if (slice.some((t) => target.split(' ').includes(t.word))) continue;
                    const raw = slice.map((t) => t.raw.replace(/[^\p{L}\p{N}'-]/gu, '')).join(' ');
                    const lengthSim = 1 - Math.abs(norm.length - target.length) / Math.max(norm.length, target.length);
                    const rhyme = rhymeKey(slice[slice.length - 1].word) === rhymeKey(target.split(' ').pop()) ? 1 : 0;
                    candidates.set(norm, { text: raw, norm, score: this.weights.lengthSimilarity * lengthSim + this.weights.rhyme * rhyme + bonus });
                }
            }
        };
        consider(this.bank.linesFor(trackId), this.weights.sameTrackBonus);
        consider(this.bank.otherLines(trackId), 0);
        return this._pick(Array.from(candidates.values()), count, rng);
    }

    /** Wrong "next lines": prefer non-adjacent lines from the same track, then other tracks. */
    lineDistractors({ answerLine, promptLine, trackId, genre = null, rng = Math.random, count = this.count }) {
        const target = normalizeText(answerLine);
        const prompt = normalizeText(promptLine);
        const targetLen = tokenizeLine(answerLine).length;
        const seen = new Set([target, prompt]);
        const scored = [];
        const consider = (lines, bonus) => {
            for (const line of lines) {
                if (seen.has(line.norm)) continue;
                seen.add(line.norm);
                const lengthSim = 1 - Math.abs(line.len - targetLen) / Math.max(line.len, targetLen);
                const genreBonus = genre && line.genre === genre ? this.weights.sameGenreBonus : 0;
                scored.push({ text: line.text, norm: line.norm, score: this.weights.lengthSimilarity * lengthSim + bonus + genreBonus });
            }
        };
        consider(this.bank.linesFor(trackId), this.weights.sameTrackBonus + 0.5);
        consider(this.bank.otherLines(trackId), 0);
        return this._pick(scored, count, rng);
    }

    /** Wrong titles / artists drawn from the eligible track pool. */
    metadataDistractors({ field, answer, tracks, genre = null, excludeArtistKey = null, rng = Math.random, count = this.count }) {
        const target = normalizeText(answer);
        const seen = new Set([target]);
        const scored = [];
        for (const t of tracks) {
            const value = field === 'artist' ? t.artist : t.title;
            const norm = normalizeText(value);
            if (!norm || seen.has(norm)) continue;
            if (field === 'title' && excludeArtistKey && t.artistKey === excludeArtistKey) continue;
            seen.add(norm);
            const sameGenre = genre && t.primaryGenre === genre ? this.weights.sameGenreBonus + 0.5 : 0;
            const pop = (t.popularity ?? 50) / 100;
            scored.push({ text: value, norm, score: sameGenre + pop * 0.5 });
        }
        return this._pick(scored, count, rng);
    }

    /** Score-weighted selection among the best candidates, deduplicated by normalised text. */
    _pick(candidates, count, rng) {
        const unique = new Map();
        for (const c of candidates) if (!unique.has(c.norm)) unique.set(c.norm, c);
        const sorted = Array.from(unique.values()).sort((a, b) => b.score - a.score);
        if (sorted.length <= count) return sorted.map((c) => c.text);
        const poolSize = Math.min(sorted.length, Math.max(count * 3, config.distractors.minCandidatePool));
        const pool = sorted.slice(0, poolSize);
        const out = [];
        while (out.length < count && pool.length) {
            const weights = pool.map((c, i) => Math.max(0.05, 1 - i / poolSize));
            let r = rng() * weights.reduce((a, b) => a + b, 0);
            let idx = 0;
            for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
            out.push(pool.splice(idx, 1)[0].text);
        }
        return out;
    }
}

module.exports = { DistractorEngine };
