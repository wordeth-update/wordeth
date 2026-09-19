'use strict';

const mongoose = require('mongoose');

const leaderboardRecordSchema = new mongoose.Schema({
    board: { type: String, enum: ['DAILY', 'WEEKLY', 'ALL_TIME', 'ARTIST'], required: true },
    periodKey: { type: String, required: true },
    playerKey: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    displayName: { type: String, default: 'Guest' },
    value: { type: Number, required: true, default: 0 },
    secondary: { type: Number, default: 0 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

leaderboardRecordSchema.index({ board: 1, periodKey: 1, playerKey: 1 }, { unique: true });
leaderboardRecordSchema.index({ board: 1, periodKey: 1, value: -1, secondary: -1 });

module.exports = mongoose.models.LeaderboardRecord || mongoose.model('LeaderboardRecord', leaderboardRecordSchema);
