const mongoose = require('mongoose');

const verseSeasonSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
        type: String,
        enum: ['draft', 'upcoming', 'active', 'voting', 'completed', 'cancelled'],
        default: 'draft',
        index: true
    },
    cadenceConfig: {
        type: { type: String, enum: ['weekly', 'biweekly', 'monthly', 'custom'], default: 'weekly' },
        themeAnnounceDay: { type: Number, default: 1 },
        submissionCloseDay: { type: Number, default: 3 },
        showcaseDay: { type: Number, default: 4 },
        votingCloseDay: { type: Number, default: 6 },
        winnersDay: { type: Number, default: 0 }
    },
    sponsorAssignments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SponsorAssignment' }],
    bannerImageUrl: { type: String, default: '' },
    rules: { type: String, default: '' },
    prizeDescription: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

verseSeasonSchema.index({ slug: 1 });
verseSeasonSchema.index({ status: 1, startAt: -1 });

module.exports = mongoose.model('VerseSeason', verseSeasonSchema);
