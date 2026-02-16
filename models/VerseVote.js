const mongoose = require('mongoose');
const crypto = require('crypto');

const verseVoteSchema = new mongoose.Schema({
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseMatch', required: true, index: true },
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseRound', required: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSeason', required: true },
    voterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    voteForSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSubmission', required: true },
    ratings: {
        performance: { type: Number, min: 0, max: 5, default: null },
        originality: { type: Number, min: 0, max: 5, default: null },
        themeFit: { type: Number, min: 0, max: 5, default: null }
    },
    ipHash: { type: String, default: '' },
    userAgentHash: { type: String, default: '' },
    flagged: { type: Boolean, default: false },
    flagReason: { type: String, default: '' }
}, { timestamps: true });

verseVoteSchema.index({ matchId: 1, voterUserId: 1 }, { unique: true });
verseVoteSchema.index({ seasonId: 1, voterUserId: 1 });

verseVoteSchema.statics.hashPrivacyField = function(value) {
    if (!value) return '';
    return crypto.createHash('sha256').update(value + (process.env.JWT_SECRET || '')).digest('hex').substring(0, 16);
};

module.exports = mongoose.model('VerseVote', verseVoteSchema);
