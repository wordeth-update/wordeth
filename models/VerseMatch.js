const mongoose = require('mongoose');

const verseMatchSchema = new mongoose.Schema({
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseRound', required: true, index: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSeason', required: true, index: true },
    matchNumber: { type: Number, required: true },
    submissionA: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSubmission', required: true },
    submissionB: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSubmission', required: true },
    status: {
        type: String,
        enum: ['pending', 'active', 'voting', 'completed', 'cancelled'],
        default: 'pending',
        index: true
    },
    winnerSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSubmission', default: null },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
    totalVotes: { type: Number, default: 0 },
    ratingsA: {
        performance: { type: Number, default: 0 },
        originality: { type: Number, default: 0 },
        themeFit: { type: Number, default: 0 },
        crowdReaction: { type: Number, default: 0 }
    },
    ratingsB: {
        performance: { type: Number, default: 0 },
        originality: { type: Number, default: 0 },
        themeFit: { type: Number, default: 0 },
        crowdReaction: { type: Number, default: 0 }
    },
    locked: { type: Boolean, default: false },
    advancedToMatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseMatch', default: null }
}, { timestamps: true });

verseMatchSchema.index({ roundId: 1, matchNumber: 1 });
verseMatchSchema.index({ seasonId: 1, status: 1 });

module.exports = mongoose.model('VerseMatch', verseMatchSchema);
