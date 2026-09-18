'use strict';

const mongoose = require('mongoose');

const bucketShape = {
    attempts: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    sumDifficulty: { type: Number, default: 0 },
    sumDifficultyCorrect: { type: Number, default: 0 },
    sumResponseMs: { type: Number, default: 0 },
    points: { type: Number, default: 0 }
};

const bucketSchema = new mongoose.Schema(bucketShape, { _id: false });

/**
 * Aggregate first-party knowledge graph for one player. Updated atomically
 * with $inc on every answer; Lyric IQ is derived from these aggregates.
 */
const playerMetricsSchema = new mongoose.Schema({
    playerKey: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    guestId: { type: String, default: null },
    totals: {
        ...bucketShape,
        recallAttempts: { type: Number, default: 0 },
        recallCorrect: { type: Number, default: 0 },
        recognitionAttempts: { type: Number, default: 0 },
        recognitionCorrect: { type: Number, default: 0 },
        typedAttempts: { type: Number, default: 0 },
        typedCorrect: { type: Number, default: 0 }
    },
    byGenre: { type: Map, of: bucketSchema, default: () => new Map() },
    byDecade: { type: Map, of: bucketSchema, default: () => new Map() },
    byMode: { type: Map, of: bucketSchema, default: () => new Map() },
    byTemplate: { type: Map, of: bucketSchema, default: () => new Map() },
    byArtist: { type: Map, of: bucketSchema, default: () => new Map() },
    recentSessionAccuracies: { type: [Number], default: [] },
    sessionsCompleted: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    bestSessionScore: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    daily: {
        streak: { type: Number, default: 0 },
        bestStreak: { type: Number, default: 0 },
        lastDateKey: { type: String, default: null },
        completed: { type: Number, default: 0 }
    },
    lyricIq: {
        value: { type: Number, default: null },
        version: { type: Number, default: null },
        provisional: { type: Boolean, default: true },
        sampleSize: { type: Number, default: 0 },
        components: { type: mongoose.Schema.Types.Mixed, default: {} },
        subScores: { type: mongoose.Schema.Types.Mixed, default: {} },
        computedAt: { type: Date, default: null }
    },
    schemaVersion: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.models.PlayerMetrics || mongoose.model('PlayerMetrics', playerMetricsSchema);
