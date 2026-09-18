'use strict';

const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
    playerKey: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    guestId: { type: String, default: null },
    gameMode: { type: String, required: true, index: true },
    category: { type: String, default: null },
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'ABANDONED', 'EXPIRED'], default: 'ACTIVE', index: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    deadlineAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now },
    questionCount: { type: Number, required: true },
    questionsServed: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    totalResponseMs: { type: Number, default: 0 },
    difficultyDistribution: {
        EASY: { type: Number, default: 0 },
        MEDIUM: { type: Number, default: 0 },
        HARD: { type: Number, default: 0 },
        ELITE: { type: Number, default: 0 }
    },
    questionIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    usedTrackIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    dailyDateKey: { type: String, default: null },
    scoreModelVersion: { type: Number, default: 1 },
    lyricIqBefore: { type: Number, default: null },
    lyricIqAfter: { type: Number, default: null },
    referral: {
        challengeCode: { type: String, default: null },
        referredByPlayerKey: { type: String, default: null }
    },
    endReason: { type: String, default: null },
    // Public share snapshot taken at completion (name, Lyric IQ, headline, top genre); never lyrics.
    shareCard: { type: mongoose.Schema.Types.Mixed, default: null },
    schemaVersion: { type: Number, default: 1 }
}, { timestamps: true });

gameSessionSchema.index({ playerKey: 1, status: 1, lastActivityAt: -1 });
gameSessionSchema.index({ playerKey: 1, dailyDateKey: 1 }, { unique: true, partialFilterExpression: { dailyDateKey: { $type: 'string' } } });
gameSessionSchema.index({ status: 1, endedAt: -1 });

gameSessionSchema.methods.toPublic = function toPublic() {
    const answered = this.correctCount + this.wrongCount;
    return {
        id: String(this._id),
        gameMode: this.gameMode,
        category: this.category,
        status: this.status,
        startedAt: this.startedAt,
        endedAt: this.endedAt,
        deadlineAt: this.deadlineAt,
        questionCount: this.questionCount,
        questionsServed: this.questionsServed,
        answered,
        correctCount: this.correctCount,
        wrongCount: this.wrongCount,
        accuracy: answered ? Number((this.correctCount / answered).toFixed(3)) : 0,
        score: this.score,
        currentStreak: this.currentStreak,
        bestStreak: this.bestStreak,
        averageResponseMs: answered ? Math.round(this.totalResponseMs / answered) : 0,
        difficultyDistribution: this.difficultyDistribution,
        dailyDateKey: this.dailyDateKey,
        endReason: this.endReason
    };
};

module.exports = mongoose.models.GameSession || mongoose.model('GameSession', gameSessionSchema);
