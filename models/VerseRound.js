const mongoose = require('mongoose');

const verseRoundSchema = new mongoose.Schema({
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSeason', required: true, index: true },
    name: { type: String, required: true, trim: true },
    theme: { type: String, required: true, trim: true },
    themeDescription: { type: String, default: '' },
    roundNumber: { type: Number, required: true },
    roundType: {
        type: String,
        enum: ['qualifying', 'round_of_32', 'round_of_16', 'quarterfinal', 'semifinal', 'final', 'championship'],
        default: 'qualifying'
    },
    submissionOpenAt: { type: Date, required: true },
    submissionCloseAt: { type: Date, required: true },
    showcaseStartAt: { type: Date },
    showcaseEndAt: { type: Date },
    votingOpenAt: { type: Date, required: true },
    votingCloseAt: { type: Date, required: true },
    status: {
        type: String,
        enum: ['draft', 'submissions_open', 'submissions_closed', 'showcase', 'voting', 'completed', 'cancelled'],
        default: 'draft',
        index: true
    },
    maxSubmissions: { type: Number, default: 32 },
    bracketSize: { type: Number, default: 16 },
    sponsorAssignments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SponsorAssignment' }],
    locked: { type: Boolean, default: false }
}, { timestamps: true });

verseRoundSchema.index({ seasonId: 1, roundNumber: 1 });
verseRoundSchema.index({ status: 1 });

module.exports = mongoose.model('VerseRound', verseRoundSchema);
