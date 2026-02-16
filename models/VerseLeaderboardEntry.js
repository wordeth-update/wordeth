const mongoose = require('mongoose');

const verseLeaderboardEntrySchema = new mongoose.Schema({
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSeason', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    points: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    totalVotesReceived: { type: Number, default: 0 },
    totalReactions: { type: Number, default: 0 },
    avgPerformanceRating: { type: Number, default: 0 },
    avgOriginalityRating: { type: Number, default: 0 },
    avgThemeFitRating: { type: Number, default: 0 },
    rank: { type: Number, default: null }
}, { timestamps: true });

verseLeaderboardEntrySchema.index({ seasonId: 1, userId: 1 }, { unique: true });
verseLeaderboardEntrySchema.index({ seasonId: 1, points: -1 });
verseLeaderboardEntrySchema.index({ seasonId: 1, rank: 1 });

module.exports = mongoose.model('VerseLeaderboardEntry', verseLeaderboardEntrySchema);
