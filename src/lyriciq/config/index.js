'use strict';

/**
 * Central configuration for Wordeth Lyric IQ.
 *
 * Every tunable weight, threshold, limit and timing lives here so nothing is a
 * bare magic number inside an engine. Values can be overridden with
 * environment variables where it makes operational sense (prefixed LYRICIQ_).
 */

const env = process.env;

function intEnv(name, fallback) {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

function floatEnv(name, fallback) {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
}

function boolEnv(name, fallback) {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

const config = {
    /** Which lyric provider backs the catalog: 'musixmatch' | 'synthetic'. */
    provider: {
        name: (env.LYRICIQ_LYRIC_PROVIDER || (env.MUSIXMATCH_API_KEY ? 'musixmatch' : 'synthetic')).toLowerCase(),
        musixmatch: {
            baseUrl: env.MUSIXMATCH_BASE_URL || 'https://api.musixmatch.com/ws/1.1',
            apiKey: env.MUSIXMATCH_API_KEY || '',
            timeoutMs: intEnv('LYRICIQ_PROVIDER_TIMEOUT_MS', 8000),
            // Seed queries used when the catalog needs new tracks from Musixmatch.
            seedPageSize: intEnv('LYRICIQ_MUSIXMATCH_SEED_PAGE_SIZE', 25),
            // How many lines of a lyric body may be used in prompts (licence-driven).
            maxExcerptLines: intEnv('LYRICIQ_MAX_EXCERPT_LINES', 2)
        },
        /** Always allow the synthetic catalog to merge in (dev/test only by default). */
        includeSynthetic: boolEnv('LYRICIQ_INCLUDE_SYNTHETIC', env.NODE_ENV !== 'production')
    },

    /** Cache TTLs (ms). Lyric bodies are cached briefly by default — respect the licence. */
    cache: {
        trackMetadataTtlMs: intEnv('LYRICIQ_CACHE_TRACK_TTL_MS', 24 * 60 * 60 * 1000),
        lyricContentTtlMs: intEnv('LYRICIQ_CACHE_LYRIC_TTL_MS', 60 * 60 * 1000),
        questionTtlMs: intEnv('LYRICIQ_CACHE_QUESTION_TTL_MS', 10 * 60 * 1000),
        dailyChallengeTtlMs: intEnv('LYRICIQ_CACHE_DAILY_TTL_MS', 6 * 60 * 60 * 1000),
        restrictionsTtlMs: intEnv('LYRICIQ_CACHE_RESTRICTIONS_TTL_MS', 60 * 1000),
        featureFlagsTtlMs: intEnv('LYRICIQ_CACHE_FLAGS_TTL_MS', 30 * 1000),
        maxEntriesPerNamespace: intEnv('LYRICIQ_CACHE_MAX_ENTRIES', 2000)
    },

    /** Session lifecycle. */
    session: {
        questionTtlMs: intEnv('LYRICIQ_QUESTION_TTL_MS', 3 * 60 * 1000),
        idleExpiryMs: intEnv('LYRICIQ_SESSION_IDLE_EXPIRY_MS', 30 * 60 * 1000),
        maxGenerationAttempts: intEnv('LYRICIQ_MAX_GENERATION_ATTEMPTS', 12),
        guestTokenTtl: env.LYRICIQ_GUEST_TOKEN_TTL || '30d'
    },

    /** Blank-selection weights (see engines/question/BlankSelector.js). */
    blank: {
        weights: {
            semanticImportance: floatEnv('LYRICIQ_W_SEMANTIC', 1.0),
            memorability: floatEnv('LYRICIQ_W_MEMORABILITY', 0.6),
            rhymeImportance: floatEnv('LYRICIQ_W_RHYME', 0.8),
            phraseUniqueness: floatEnv('LYRICIQ_W_UNIQUENESS', 0.9),
            linePosition: floatEnv('LYRICIQ_W_POSITION', 0.7),
            stopwordPenalty: floatEnv('LYRICIQ_W_STOPWORD', 3.0),
            ambiguityPenalty: floatEnv('LYRICIQ_W_AMBIGUITY', 1.2)
        },
        minWordLength: 3,
        minLineWords: 4,
        maxLineWords: 14,
        phraseMinWords: 2,
        phraseMaxWords: 3
    },

    /** Distractor engine. */
    distractors: {
        count: 3,
        weights: {
            lengthSimilarity: 1.0,
            rhyme: 1.2,
            partOfSpeech: 1.4,
            sameTrackBonus: 0.4,
            sameGenreBonus: 0.3
        },
        minCandidatePool: 12
    },

    /** Difficulty engine, 0–100 scale. */
    difficulty: {
        bands: [
            { max: 24, label: 'EASY' },
            { max: 49, label: 'MEDIUM' },
            { max: 74, label: 'HARD' },
            { max: 100, label: 'ELITE' }
        ],
        templateBase: {
            GUESS_THE_ARTIST: 18,
            GUESS_THE_SONG: 24,
            MISSING_WORD: 30,
            FINISH_THE_LYRIC: 36,
            NEXT_LINE: 44,
            MISSING_PHRASE: 52
        },
        typedBonus: 18,
        perHiddenWord: 6,
        perAnswerCharOver6: 1.5,
        answerLengthCap: 15,
        popularityWeight: 12,
        choiceSimilarityWeight: 10
    },

    /** Scoring model v1. */
    scoring: {
        modelVersion: 1,
        baseScore: 100,
        difficultyMultiplierMin: 1.0,
        difficultyMultiplierMax: 2.0,
        speedBonusMax: 50,
        speedWindowMs: 10000,
        minCountedResponseMs: 250,
        streakBonusPerStep: 10,
        streakBonusCap: 100,
        typedRecallMultiplier: 1.25,
        maxPointsPerQuestion: 450
    },

    /** Lyric IQ model v1. */
    lyricIq: {
        modelVersion: 1,
        weights: {
            accuracy: 0.35,
            difficulty: 0.25,
            recall: 0.15,
            breadth: 0.15,
            consistency: 0.10
        },
        priorAccuracy: 0.5,
        priorStrength: 6,
        minQuestionsForScore: 10,
        minQuestionsForCategoryScore: intEnv('LYRICIQ_MIN_CATEGORY_QUESTIONS', 15),
        breadthSaturation: { artists: 25, genres: 5, decades: 5 },
        recentSessionWindow: 20
    },

    /** Game mode definitions. */
    modes: {
        QUICK_PLAY: { questionCount: 10, timeLimitMs: null, endOnWrong: false, label: 'Play' },
        DAILY_10: { questionCount: 10, timeLimitMs: null, endOnWrong: false, label: 'Daily 10' },
        RAPID_FIRE: { questionCount: 60, timeLimitMs: 60 * 1000, endOnWrong: false, label: 'Rapid Fire' },
        STREAK: { questionCount: 200, timeLimitMs: null, endOnWrong: true, label: 'Streak' }
    },

    daily: {
        questionCount: 10,
        seedSalt: env.LYRICIQ_DAILY_SEED_SALT || 'wordeth-daily-v1',
        timezone: 'UTC'
    },

    leaderboards: {
        pageSize: 25
    },

    /** Typed answer tolerance. */
    answers: {
        allowedEditDistanceByLength: [
            { maxLength: 4, distance: 0 },
            { maxLength: 8, distance: 1 },
            { maxLength: 1000, distance: 2 }
        ],
        maxAnswerLength: 120
    },

    featureFlags: {
        defaults: {
            dailyChallenge: true,
            rapidFire: true,
            streakMode: true,
            typedAnswers: true,
            lyricIQ: true,
            leaderboards: true,
            guestPlay: true,
            artistChallenges: false,
            shareCards: true
        }
    },

    internal: {
        apiKey: env.LYRICIQ_INTERNAL_API_KEY || ''
    }
};

module.exports = config;
