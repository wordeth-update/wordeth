const mongoose = require('mongoose');

const roomRatingSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        index: true
    },
    replayId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Replay',
        default: null
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    creatorUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    tags: [{
        type: String,
        enum: ['great-host', 'good-music', 'lively-chat', 'informative', 'entertaining', 'professional']
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

roomRatingSchema.index({ roomId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('RoomRating', roomRatingSchema);
