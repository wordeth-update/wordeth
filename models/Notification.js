const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['new_follower', 'follower_created_room', 'follower_joined_room', 'collab_invite', 'collab_response', 'room_nudge_5min', 'room_nudge_start', 'room_live', 'room_invite'],
        required: true
    },
    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fromUserName: {
        type: String,
        default: ''
    },
    fromUserAvatar: {
        type: String,
        default: ''
    },
    roomId: {
        type: String,
        default: null
    },
    roomName: {
        type: String,
        default: null
    },
    read: {
        type: Boolean,
        default: false,
        index: true
    }
}, {
    timestamps: true
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
