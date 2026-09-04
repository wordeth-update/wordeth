const mongoose = require('mongoose');

const emailOutboxEventSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['wildcard_peek_available'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'sent', 'failed'],
        default: 'pending',
        index: true
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    attempts: {
        type: Number,
        default: 0
    },
    lastError: {
        type: String,
        default: ''
    },
    processedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

emailOutboxEventSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('EmailOutboxEvent', emailOutboxEventSchema);