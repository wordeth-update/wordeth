const mongoose = require('mongoose');

const replaySchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        index: true
    },
    creatorUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    genre: {
        type: String,
        default: '',
        index: true
    },
    duration: {
        type: Number,
        default: 0
    },
    participantCount: {
        type: Number,
        default: 0
    },
    tokenPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    totalPlays: {
        type: Number,
        default: 0,
        min: 0
    },
    totalEarnings: {
        type: Number,
        default: 0,
        min: 0
    },
    rating: {
        average: { type: Number, default: 0 },
        count: { type: Number, default: 0 }
    },
    participantHistory: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    status: {
        type: String,
        enum: ['processing', 'available', 'hidden', 'removed'],
        default: 'processing',
        index: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    boostedUntil: {
        type: Date,
        default: null,
        index: true
    },
    boostTier: {
        type: String,
        enum: ['none', 'small', 'medium', 'featured'],
        default: 'none'
    }
}, {
    timestamps: true
});

replaySchema.index({ creatorUserId: 1, status: 1 });
replaySchema.index({ genre: 1, status: 1 });
replaySchema.index({ boostedUntil: 1, status: 1 });

module.exports = mongoose.model('Replay', replaySchema);
