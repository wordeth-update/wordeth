const mongoose = require('mongoose');

const usageEventSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    sessionId: {
        type: String,
        default: null,
        index: true
    },
    segment: {
        type: String,
        enum: ['lyrics', 'community', 'merch', 'auth', 'general', 'verses', 'tournament'],
        required: true,
        index: true
    },
    eventType: {
        type: String,
        required: true,
        index: true
    },
    metadata: {
        query: String,
        artist: String,
        songTitle: String,
        genre: String,
        roomId: String,
        roomName: String,
        productId: String,
        productName: String,
        orderValue: Number,
        quantity: Number,
        designId: String,
        duration: Number,
        page: String,
        referrer: String,
        userAgent: String,
        extra: mongoose.Schema.Types.Mixed
    },
    ip: {
        type: String,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: false
});

usageEventSchema.index({ segment: 1, eventType: 1, timestamp: -1 });
usageEventSchema.index({ userId: 1, segment: 1, timestamp: -1 });
usageEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('UsageEvent', usageEventSchema);
