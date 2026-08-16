const mongoose = require('mongoose');

// Tip pool for a live room. Created lazily on first tip (or at open for
// scheduled rooms). Splits are snapshotted at creation so settlement never
// depends on mutable state elsewhere.
const roomPoolSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    scheduledRoomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ScheduledRoom',
        default: null
    },
    hostUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // [{ userId, splitPercent }] — must total 100
    splits: [{
        _id: false,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        splitPercent: { type: Number, required: true, min: 0, max: 100 }
    }],
    balance: { type: Number, default: 0, min: 0 },
    tipCount: { type: Number, default: 0 },
    // open -> closing (exactly one closer wins) -> settled
    status: {
        type: String,
        enum: ['open', 'closing', 'settled'],
        default: 'open',
        index: true
    },
    closedAt: { type: Date, default: null },
    settledAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('RoomPool', roomPoolSchema);
