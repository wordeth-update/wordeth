'use strict';

const config = require('../../config');
const PlayerMetrics = require('../../models/PlayerMetrics');
const { getMetrics } = require('./playerMetricsService');

/**
 * Lyric IQ — Wordeth's gameplay knowledge metric (NOT a psychometric IQ).
 *
 *   LyricIQ = 100 × ( wA·Accuracy + wD·Difficulty + wR·Recall + wB·Breadth + wC·Consistency )
 *
 * Every component is normalised to 0–1. Accuracy-type components are shrunk
 * toward a prior with a small sample so a lucky first session cannot claim 100.
 * Model version lives in config.lyricIq.modelVersion; raw aggregates are kept so
 * future versions can be recomputed from the same data.
 */

const GENRE_LABELS = { hiphop: 'Hip-Hop IQ', rnb: 'R&B IQ', pop: 'Pop IQ', rock: 'Rock IQ', country: 'Country IQ', other: 'Other IQ' };

function shrunkAccuracy(correct, attempts) {
    const { priorAccuracy, priorStrength } = config.lyricIq;
    return (correct + priorAccuracy * priorStrength) / (attempts + priorStrength);
}

/** Average difficulty conquered, normalised so ~80 difficulty ≈ 1. */
function difficultyComponent(bucket) {
    if (!bucket || !bucket.correct) return 0.25;
    const avg = bucket.sumDifficultyCorrect / bucket.correct;
    return clamp01(avg / 80);
}

function breadthComponent(metrics) {
    const sat = config.lyricIq.breadthSaturation;
    const count = (map) => (map ? Object.keys(map).filter((k) => (map[k]?.attempts || 0) >= 2).length : 0);
    const artists = clamp01(count(metrics.byArtist) / sat.artists);
    const genres = clamp01(count(metrics.byGenre) / sat.genres);
    const decades = clamp01(count(metrics.byDecade) / sat.decades);
    return (artists + genres + decades) / 3;
}

function consistencyComponent(accuracies) {
    if (!accuracies || accuracies.length < 2) return 0.5;
    const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    const variance = accuracies.reduce((a, b) => a + (b - mean) ** 2, 0) / accuracies.length;
    const std = Math.sqrt(variance);
    return clamp01(1 - std * 2);
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

function categoryScore(bucket) {
    if (!bucket || !(bucket.attempts >= config.lyricIq.minQuestionsForCategoryScore)) return null;
    const acc = shrunkAccuracy(bucket.correct, bucket.attempts);
    const diff = difficultyComponent(bucket);
    return Math.round(100 * (0.6 * acc + 0.4 * diff));
}

/** "the-hollow-kings" → "The Hollow Kings"; the metrics graph only keeps the key. */
function artistLabel(artistKey) {
    return String(artistKey || '').split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Artist';
}

/** Pure computation from a plain metrics object. */
function computeLyricIq(metricsDoc) {
    const m = metricsDoc && metricsDoc.toObject ? metricsDoc.toObject({ flattenMaps: true }) : (metricsDoc || {});
    const totals = m.totals || {};
    const attempts = totals.attempts || 0;
    const w = config.lyricIq.weights;

    const components = {
        accuracy: attempts ? shrunkAccuracy(totals.correct || 0, attempts) : 0,
        difficulty: difficultyComponent(totals),
        recall: totals.recallAttempts ? shrunkAccuracy(totals.recallCorrect || 0, totals.recallAttempts) : 0.35,
        breadth: breadthComponent(m),
        consistency: consistencyComponent(m.recentSessionAccuracies)
    };
    const raw = w.accuracy * components.accuracy + w.difficulty * components.difficulty + w.recall * components.recall + w.breadth * components.breadth + w.consistency * components.consistency;
    const value = attempts ? Math.round(100 * clamp01(raw)) : null;

    const subScores = {};
    for (const [genre, bucket] of Object.entries(m.byGenre || {})) {
        const s = categoryScore(bucket);
        if (s !== null) subScores[genre] = { label: GENRE_LABELS[genre] || `${genre} IQ`, value: s, attempts: bucket.attempts };
    }
    const eras = {};
    for (const [decade, bucket] of Object.entries(m.byDecade || {})) {
        const s = categoryScore(bucket);
        if (s !== null && decade !== 'unknown') eras[decade] = { label: `${decade} IQ`, value: s, attempts: bucket.attempts };
    }
    const recallIq = categoryScore({ attempts: totals.recallAttempts, correct: totals.recallCorrect, sumDifficultyCorrect: totals.sumDifficultyCorrect * ((totals.recallCorrect || 0) / Math.max(1, totals.correct || 1)) });
    const recognitionIq = categoryScore({ attempts: totals.recognitionAttempts, correct: totals.recognitionCorrect, sumDifficultyCorrect: totals.sumDifficultyCorrect * ((totals.recognitionCorrect || 0) / Math.max(1, totals.correct || 1)) });
    const artistsKnown = Object.values(m.byArtist || {}).filter((b) => b.attempts >= 3 && b.correct / b.attempts >= 0.75).length;
    // Artist IQ: the same category score, per artist, once the player has faced enough of their songs.
    const artists = {};
    for (const [artistKey, bucket] of Object.entries(m.byArtist || {})) {
        if (artistKey === 'unknown') continue;
        const s = categoryScore(bucket);
        if (s !== null) artists[artistKey] = { label: `${artistLabel(artistKey)} IQ`, value: s, attempts: bucket.attempts };
    }

    return {
        value,
        version: config.lyricIq.modelVersion,
        provisional: attempts < config.lyricIq.minQuestionsForScore,
        sampleSize: attempts,
        components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Number(v.toFixed(3))])),
        weights: w,
        subScores: {
            genres: subScores,
            eras,
            recall: recallIq !== null ? { label: 'Recall IQ', value: recallIq, attempts: totals.recallAttempts } : null,
            recognition: recognitionIq !== null ? { label: 'Recognition IQ', value: recognitionIq, attempts: totals.recognitionAttempts } : null,
            artists,
            artistsKnown
        },
        thresholds: { minQuestionsForScore: config.lyricIq.minQuestionsForScore, minQuestionsForCategoryScore: config.lyricIq.minQuestionsForCategoryScore }
    };
}

/** Human explanation of what the number means, for the profile screen. */
function explainLyricIq(result) {
    if (!result || result.value === null) return ['Play a session to establish your Lyric IQ.'];
    const c = result.components;
    const lines = [];
    lines.push(`Accuracy (${pct(c.accuracy)}): how often you get it right, adjusted for how much you have played.`);
    lines.push(`Difficulty (${pct(c.difficulty)}): the difficulty of the questions you actually conquer.`);
    lines.push(`Recall (${pct(c.recall)}): finishing lines and filling blanks, not just recognising songs.`);
    lines.push(`Breadth (${pct(c.breadth)}): range across artists, genres and eras.`);
    lines.push(`Consistency (${pct(c.consistency)}): how steady your sessions are.`);
    if (result.provisional) lines.push(`Provisional until ${result.thresholds.minQuestionsForScore} questions have been answered.`);
    return lines;
}

function pct(n) { return `${Math.round(n * 100)}%`; }

/** Recompute and persist a player's Lyric IQ. */
async function refreshLyricIq(playerKey) {
    const metrics = await getMetrics(playerKey);
    if (!metrics) return computeLyricIq(null);
    const result = computeLyricIq(metrics);
    await PlayerMetrics.updateOne({ playerKey }, {
        $set: {
            'lyricIq.value': result.value,
            'lyricIq.version': result.version,
            'lyricIq.provisional': result.provisional,
            'lyricIq.sampleSize': result.sampleSize,
            'lyricIq.components': result.components,
            'lyricIq.subScores': result.subScores,
            'lyricIq.computedAt': new Date()
        }
    });
    return result;
}

module.exports = { computeLyricIq, explainLyricIq, refreshLyricIq, categoryScore, artistLabel, GENRE_LABELS };
