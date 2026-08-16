const mongoose = require('mongoose');

const collaboratorSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: { type: String, default: '' },
    avatar: { type: String, default: '' },
    splitPercent: {
        type: Number,
        required: true,
        min: 0.01,
        max: 100
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'declined'],
        default: 'pending'
    },
    respondedAt: { type: Date, default: null }
}, { _id: false });

const scheduledRoomSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 120 },
    genre: { type: String, default: '', maxlength: 60 },
    topic: { type: String, default: '', maxlength: 200 },
    description: { type: String, default: '', maxlength: 1000 },
    hostUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    hostName: { type: String, default: '' },
    hostSplitPercent: { type: Number, required: true, min: 0, max: 100 },
    collaborators: {
        type: [collaboratorSchema],
        default: [],
        validate: [arr => arr.length <= 5, 'Maximum 5 collaborators']
    },
    approvalMode: {
        type: String,
        enum: ['pre-schedule', 'real-time'],
        default: 'real-time'
    },
    tokenPrice: { type: Number, default: 0, min: 0 },
    startTime: { type: Date, required: true, index: true },
    // pending_approval: pre-schedule mode, waiting on collaborator approvals
    // scheduled: confirmed on the calendar (real-time mode may still have pending approvals)
    // live: host opened it; liveRoomId points at the in-memory room
    // completed / cancelled: terminal
    status: {
        type: String,
        enum: ['pending_approval', 'scheduled', 'live', 'completed', 'cancelled'],
        default: 'scheduled',
        index: true
    },
    liveRoomId: { type: String, default: null, index: true },
    openedAt: { type: Date, default: null },
    interestCount: { type: Number, default: 0, min: 0 },
    // Atomic nudge claims — set exactly once via findOneAndUpdate guards
    nudgeFiveMinClaimedAt: { type: Date, default: null },
    nudgeStartClaimedAt: { type: Date, default: null },
    nudgeLiveClaimedAt: { type: Date, default: null }
}, { timestamps: true });

scheduledRoomSchema.index({ status: 1, startTime: 1 });
scheduledRoomSchema.index({ status: 1, interestCount: -1, startTime: 1 });
scheduledRoomSchema.index({ 'collaborators.userId': 1, status: 1 });

// True when every collaborator has approved (empty list counts as approved)
scheduledRoomSchema.methods.allApproved = function () {
    return this.collaborators.every(c => c.status === 'approved');
};

module.exports = mongoose.model('ScheduledRoom', scheduledRoomSchema);
