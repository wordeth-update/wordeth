'use strict';

/** Fewer artist tracks than this and distractors come from the wider catalogue. */
const MIN_ARTIST_POOL = 8;

const config = require('../../config');
const logger = require('../../utilities/logger');
const { shuffle, secureRandom } = require('../../utilities/random');
const { normalizeText } = require('../../utilities/text');
const { selectTrack } = require('./TrackSelector');
const { selectCandidateLines, wordFrequency } = require('./LineSelector');
const { templates, TEMPLATE_KEYS } = require('./templates');
const { DistractorEngine } = require('../distractor/DistractorEngine');
const { bank: sharedBank } = require('../distractor/vocabularyBank');
const { estimateDifficulty, bandFor } = require('../difficulty/DifficultyEngine');
const { validateQuestion } = require('../validation/QuestionValidator');
const { formatQuestion } = require('./QuestionFormatter');
const { isTrackEligibleForGame } = require('../../services/content/eligibility');

/**
 * The single question-generation pipeline used by every game mode:
 *
 *   SELECT ELIGIBLE TRACK → RESOLVE LYRIC ASSET → SELECT EXCERPT → CHOOSE TEMPLATE
 *   → SELECT BLANK → GENERATE DISTRACTORS → CALCULATE DIFFICULTY → VALIDATE
 *   → ACCEPT OR REGENERATE → FORMAT
 *
 * Dependencies (catalog access, distractor engine, rng) are injected so the
 * engine is unit-testable without a database.
 */
class QuestionEngine {
    constructor({ catalog, distractors = new DistractorEngine(), bank = sharedBank, maxAttempts = config.session.maxGenerationAttempts, stats = null } = {}) {
        if (!catalog) throw new Error('QuestionEngine requires a catalog');
        this.catalog = catalog;     // { getEligibleTracks(ctx), getLyricAsset(track) }
        this.distractors = distractors;
        this.bank = bank;
        this.maxAttempts = maxAttempts;
        this.stats = stats || { generated: 0, rejected: 0, rejectionReasons: {} };
    }

    /**
     * Generate one validated question.
     * @param opts { gameMode, template, answerType, rng, excludeTrackIds, targetDifficulty, genre, territory, restrictions, allowSynthetic }
     * @returns formatted question or null when nothing acceptable could be produced
     */
    async generate(opts = {}) {
        const rng = opts.rng || secureRandom;
        const context = { gameMode: opts.gameMode, genre: opts.genre, artistKey: opts.artistKey || null, territory: opts.territory, allowSynthetic: opts.allowSynthetic };
        const tracks = await this.catalog.getEligibleTracks(context);
        if (!tracks.length) {
            logger.warn('no_eligible_tracks', { gameMode: opts.gameMode, genre: opts.genre, artistKey: opts.artistKey || null });
            return null;
        }
        // Title/artist distractors draw from the whole eligible catalog (same genre
        // is preferred by scoring) so a narrow category never starves a question.
        // An artist round keeps its distractors inside the artist's own songs when it
        // can (that is the whole test), and widens to the genre only when too thin.
        let distractorPool;
        if (context.artistKey) {
            distractorPool = tracks.length >= MIN_ARTIST_POOL ? tracks : await this.catalog.getEligibleTracks({ ...context, artistKey: null });
        } else if (opts.genre && opts.genre !== 'all') {
            distractorPool = await this.catalog.getEligibleTracks({ ...context, genre: null });
        } else {
            distractorPool = tracks;
        }
        const rejected = [];
        const exclude = new Set((opts.excludeTrackIds || []).map(String));
        const relaxAfter = Math.ceil(this.maxAttempts / 2);

        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            const track = selectTrack(tracks, { rng, excludeTrackIds: Array.from(exclude), targetDifficulty: opts.targetDifficulty ?? null });
            if (!track) break;
            let lyric;
            try {
                lyric = await this.catalog.getLyricAsset(track);
            } catch (err) {
                rejected.push(`LYRICS_UNAVAILABLE:${err.code || 'ERROR'}`);
                exclude.add(String(track._id));
                continue;
            }
            // A requested template that keeps failing is dropped after half the budget:
            // any valid question beats no question.
            const template = attempt > relaxAfter && opts.template ? undefined : opts.template;
            const result = this.buildFromLyric({ track, lyric, tracks: distractorPool, rng, ...opts, template });
            if (result.question) {
                this.stats.generated++;
                result.question.generation = { attempts: attempt, rejectedReasons: rejected.slice(0, 20), source: 'engine' };
                logger.event('question_generated', { template: result.question.template, answerType: result.question.answerType, difficulty: result.question.difficulty, attempts: attempt, trackId: String(track._id), gameMode: opts.gameMode });
                return result.question;
            }
            rejected.push(...result.reasons);
            this.stats.rejected++;
            for (const r of result.reasons) this.stats.rejectionReasons[r] = (this.stats.rejectionReasons[r] || 0) + 1;
            logger.event('question_rejected', { reasons: result.reasons, template: result.template, trackId: String(track._id), attempt });
            // After two failures on one track, move on to another.
            if (attempt % 2 === 0) exclude.add(String(track._id));
        }
        logger.warn('question_generation_exhausted', { gameMode: opts.gameMode, rejected: rejected.slice(-10) });
        return null;
    }

    /**
     * Synchronous core: given a track + lyric asset, produce a validated
     * question or the rejection reasons. Used directly by the daily generator.
     */
    buildFromLyric({ track, lyric, tracks, rng, template, answerType, restrictions, gameMode, territory, genre }) {
        const allLines = lyric.lines && lyric.lines.length ? lyric.lines : [];
        this.bank.addTrackLines(track._id, allLines, { genre: track.primaryGenre });
        const lines = selectCandidateLines(allLines);
        if (lines.length < 3) return { question: null, reasons: ['EXCERPT_UNUSABLE'], template };

        const templateKey = template || pickTemplate(rng);
        const tpl = templates[templateKey];
        if (!tpl) return { question: null, reasons: ['TEMPLATE_UNKNOWN'], template: templateKey };
        const chosenAnswerType = tpl.answerTypes.includes(answerType) ? answerType : 'MULTIPLE_CHOICE';

        const built = tpl.build({ track, lines, allLines, wordFreq: wordFrequency(allLines), rng, answerType: chosenAnswerType, pool: tracks });
        if (!built) return { question: null, reasons: ['NO_USABLE_LINE'], template: templateKey };

        let choices = [];
        let choiceIndex = null;
        if (chosenAnswerType === 'MULTIPLE_CHOICE') {
            const distractors = this._distractorsFor(built, { track, tracks, rng });
            if (distractors.length < config.distractors.count) return { question: null, reasons: ['INSUFFICIENT_DISTRACTORS'], template: templateKey };
            // Present every word/phrase choice in the same case as the answer so
            // capitalisation (line starts, proper nouns) cannot hint at the key.
            const styled = ['word', 'phrase'].includes(built.distractorKind)
                ? [built.answer, ...distractors].map((c) => matchCase(c, built.answer))
                : [built.answer, ...distractors];
            choices = shuffle(styled, rng);
            choiceIndex = choices.findIndex((c) => normalizeText(c) === normalizeText(built.answer));
        }

        const difficulty = estimateDifficulty({ template: templateKey, answerType: chosenAnswerType, answer: built.answer, hiddenWordCount: built.hiddenWordCount, track, choices, promptKind: built.promptKind });
        const eligibility = restrictions ? isTrackEligibleForGame(track, { gameMode, territory, genre }, restrictions) : { eligible: true };

        const candidate = {
            template: templateKey,
            skill: tpl.skill,
            answerType: chosenAnswerType,
            prompt: { kind: built.promptKind, lines: built.lines, instruction: tpl.instruction },
            answer: { canonical: built.answer, accepted: acceptedForms(built.answer) },
            choices,
            choiceIndex,
            hiddenWordCount: built.hiddenWordCount,
            difficulty,
            difficultyBand: bandFor(difficulty),
            track,
            eligibility
        };
        const validation = validateQuestion(candidate);
        if (!validation.valid) return { question: null, reasons: validation.reasons, template: templateKey };
        return { question: formatQuestion(candidate), reasons: [], template: templateKey };
    }

    _distractorsFor(built, { track, tracks, rng }) {
        const visibleText = built.lines.join(' ');
        switch (built.distractorKind) {
            case 'word':
                return this.distractors.wordDistractors({ answer: built.answer, visibleText, trackId: track._id, genre: track.primaryGenre, rng });
            case 'phrase':
                return this.distractors.phraseDistractors({ answer: built.answer, wordCount: built.hiddenWordCount, visibleText, trackId: track._id, rng });
            case 'line':
                return this.distractors.lineDistractors({ answerLine: built.answer, promptLine: built.lines[0], trackId: track._id, genre: track.primaryGenre, rng });
            case 'title':
                return this.distractors.metadataDistractors({ field: 'title', answer: built.answer, tracks, genre: track.primaryGenre, excludeArtistKey: track.artistKey, rng });
            case 'artist':
                return this.distractors.metadataDistractors({ field: 'artist', answer: built.answer, tracks, genre: track.primaryGenre, rng });
            default:
                return [];
        }
    }
}

/** Apply the answer's capitalisation style (lower / Capitalised) to a choice. */
function matchCase(choice, answer) {
    const lower = String(choice).toLowerCase();
    if (/^[A-Z]/.test(String(answer))) return lower.replace(/^\p{L}/u, (c) => c.toUpperCase());
    return lower;
}

/** Accepted typed forms: canonical plus common contractions/spellings. */
function acceptedForms(answer) {
    const base = normalizeText(answer);
    const forms = new Set([base]);
    forms.add(base.replace(/ing$/, 'in'));
    forms.add(base.replace(/in$/, 'ing'));
    forms.add(base.replace(/\bcause\b/, 'because'));
    return Array.from(forms).filter(Boolean);
}

function pickTemplate(rng) {
    return TEMPLATE_KEYS[Math.floor(rng() * TEMPLATE_KEYS.length)];
}

module.exports = { QuestionEngine, acceptedForms, matchCase };
