const mongoose = require('mongoose');

const sponsorAssignmentSchema = new mongoose.Schema({
    sponsorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sponsor', required: true, index: true },
    scopeType: {
        type: String,
        enum: ['season', 'round', 'leaderboard', 'tile', 'room', 'winner', 'theme'],
        required: true
    },
    scopeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    placementKey: {
        type: String,
        enum: ['naming_rights', 'presented_by', 'powered_by', 'leaderboard_sponsor', 'featured_verse', 'top_rising', 'design_challenge', 'room_sting', 'winner_sting', 'theme_sponsor', 'merch_drop'],
        required: true
    },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
    rules: {
        playStingOnEntry: { type: Boolean, default: false },
        playStingOnWinner: { type: Boolean, default: false },
        showLogoOnLeaderboard: { type: Boolean, default: false },
        showBannerOnPage: { type: Boolean, default: false },
        stingForAllUsers: { type: Boolean, default: false }
    }
}, { timestamps: true });

sponsorAssignmentSchema.index({ scopeType: 1, scopeId: 1, placementKey: 1 });
sponsorAssignmentSchema.index({ isActive: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.model('SponsorAssignment', sponsorAssignmentSchema);
