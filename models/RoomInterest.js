const mongoose = require('mongoose');

// One document per (scheduledRoom, user). Public endpoints must NEVER return
// the roster — only counts and the caller's own flag.
const roomInterestSchema = new mongoose.Schema({
    scheduledRoomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ScheduledRoom',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

roomInterestSchema.index({ scheduledRoomId: 1, userId: 1 }, { unique: true });
roomInterestSchema.index({ userId: 1 });

module.exports = mongoose.model('RoomInterest', roomInterestSchema);
