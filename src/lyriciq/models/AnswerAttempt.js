'use strict';

const mongoose = require('mongoose');

/**
 * Raw gameplay record. Enough is stored to recompute any scoring or Lyric IQ
 * model version later; lyric text is deliberately not stored here.
 */
const answerAttemptSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession', required: true, index: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionInstance', required: true, unique: true },
    playerKey: { type: String, required: true, index: true },
    gameMode: { type: String, required: true },
    template: { type: String, required: true },
    skill: { type: String, required: true },
    answerType: { type: String, required: true },
    normalizedInput: { type: String, default: '' },
    choiceIndex: { type: Number, default: null },
    correct: { type: Boolean, required: true },
    pointsAwarded: { type: Number, required: true },
    responseTimeMs: { type: Number, required: true },
    difficulty: { type: Number, required: true },
    difficultyBand: { type: String, required: true },
    streakAtAnswer: { type: Number, default: 0 },
    trackDimensions: {
        trackId: { type: mongoose.Schema.Types.ObjectId, default: null },
        artistKey: { type: String, default: null },
        genre: { type: String, default: null },
        decade: { type: String, default: null }
    },
    scoreModelVersion: { type: Number, required: true },
    timedOut: { type: Boolean, default: false }
}, { timestamps: true });

answerAttemptSchema.index({ playerKey: 1, createdAt: -1 });

module.exports = mongoose.models.AnswerAttempt || mongoose.model('AnswerAttempt', answerAttemptSchema);
