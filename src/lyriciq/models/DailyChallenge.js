'use strict';

const mongoose = require('mongoose');

/**
 * One canonical challenge per UTC date. `questionSpecs` is the full, auditable
 * specification (including answer keys) — it is never sent to a client; players
 * receive QuestionInstances instantiated from these specs.
 */
const dailyChallengeSchema = new mongoose.Schema({
    dateKey: { type: String, required: true, unique: true },
    seed: { type: String, required: true },
    questionSpecs: { type: [mongoose.Schema.Types.Mixed], default: [], select: false },
    questionCount: { type: Number, required: true },
    generatorVersion: { type: Number, default: 1 },
    generatedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['READY', 'RETIRED'], default: 'READY' },
    stats: {
        plays: { type: Number, default: 0 },
        completions: { type: Number, default: 0 },
        scoreTotal: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.models.DailyChallenge || mongoose.model('DailyChallenge', dailyChallengeSchema);
