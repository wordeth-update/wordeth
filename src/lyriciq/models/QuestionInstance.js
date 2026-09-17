'use strict';

const mongoose = require('mongoose');

/**
 * A question served to one player inside one session. The answer key is stored
 * with `select: false` so it can never leak through a default query; only the
 * answer service reads it explicitly.
 */
const questionInstanceSchema = new mongoose.Schema({
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameSession', required: true },
    playerKey: { type: String, required: true, index: true },
    index: { type: Number, required: true, min: 0 },
    gameMode: { type: String, required: true },
    template: { type: String, required: true },
    skill: { type: String, enum: ['RECALL', 'RECOGNITION'], required: true },
    answerType: { type: String, enum: ['MULTIPLE_CHOICE', 'TYPED'], required: true },
    prompt: {
        kind: { type: String, required: true }, // BLANK | EXCERPT
        lines: { type: [String], default: [] },
        instruction: { type: String, default: '' },
        blankLength: { type: Number, default: 0 }
    },
    choices: { type: [String], default: [] },
    difficulty: { type: Number, required: true, min: 0, max: 100 },
    difficultyBand: { type: String, required: true },
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', required: true },
    trackPublic: { type: mongoose.Schema.Types.Mixed, default: {} },
    revealTrack: { type: Boolean, default: false },
    answerKey: {
        type: new mongoose.Schema({
            canonical: { type: String, required: true },
            accepted: { type: [String], default: [] },
            choiceIndex: { type: Number, default: null }
        }, { _id: false }),
        select: false
    },
    status: { type: String, enum: ['PENDING', 'ANSWERED', 'EXPIRED', 'REJECTED'], default: 'PENDING', index: true },
    servedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    answeredAt: { type: Date, default: null },
    questionVersion: { type: Number, default: 1 },
    generation: {
        attempts: { type: Number, default: 1 },
        rejectedReasons: { type: [String], default: [] },
        source: { type: String, default: 'engine' }
    },
    dailySpecIndex: { type: Number, default: null }
}, { timestamps: true });

questionInstanceSchema.index({ sessionId: 1, index: 1 }, { unique: true });
questionInstanceSchema.index({ sessionId: 1, status: 1 });

/** The only shape ever serialised to the client before an answer. */
questionInstanceSchema.methods.toPublic = function toPublic() {
    return {
        id: String(this._id),
        sessionId: String(this.sessionId),
        index: this.index,
        gameMode: this.gameMode,
        template: this.template,
        skill: this.skill,
        answerType: this.answerType,
        prompt: {
            kind: this.prompt.kind,
            lines: this.prompt.lines,
            instruction: this.prompt.instruction,
            blankLength: this.prompt.blankLength
        },
        choices: this.answerType === 'MULTIPLE_CHOICE' ? this.choices : [],
        difficulty: this.difficulty,
        difficultyBand: this.difficultyBand,
        trackPublicMetadata: this.revealTrack ? this.trackPublic : null,
        questionVersion: this.questionVersion,
        servedAt: this.servedAt,
        expiresAt: this.expiresAt
    };
};

module.exports = mongoose.models.QuestionInstance || mongoose.model('QuestionInstance', questionInstanceSchema);
