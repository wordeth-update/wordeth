const mongoose = require('mongoose');

const audioBankSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    artist: {
        type: String,
        default: 'Wordeth Audio Bank'
    },
    genre: {
        type: String,
        default: 'general',
        index: true
    },
    mood: {
        type: String,
        default: 'chill',
        index: true
    },
    audioUrl: {
        type: String,
        required: true
    },
    previewUrl: {
        type: String,
        default: ''
    },
    duration: {
        type: Number,
        default: 30
    },
    bpm: {
        type: Number,
        default: 0
    },
    tokenPrice: {
        type: Number,
        required: true,
        min: 1
    },
    rentalDays: {
        type: Number,
        default: 30
    },
    coverArt: {
        type: String,
        default: ''
    },
    tags: [String],
    active: {
        type: Boolean,
        default: true,
        index: true
    },
    featured: {
        type: Boolean,
        default: false
    },
    totalRentals: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

audioBankSchema.index({ title: 'text', artist: 'text', tags: 'text' });

module.exports = mongoose.model('AudioBank', audioBankSchema);
