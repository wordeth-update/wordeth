const mongoose = require('mongoose');

const sponsorMetricEventSchema = new mongoose.Schema({
    sponsorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sponsor', required: true, index: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SponsorAssignment', default: null },
    eventType: {
        type: String,
        enum: ['impression', 'click', 'sting_played', 'room_join', 'winner_view', 'leaderboard_view', 'cta_click', 'banner_view'],
        required: true
    },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

sponsorMetricEventSchema.index({ sponsorId: 1, eventType: 1, createdAt: -1 });
sponsorMetricEventSchema.index({ assignmentId: 1, createdAt: -1 });

module.exports = mongoose.model('SponsorMetricEvent', sponsorMetricEventSchema);
