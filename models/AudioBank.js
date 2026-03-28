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
        default: 'general'
    },
    audioUrl: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        default: 30
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
    totalRentals: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AudioBank', audioBankSchema);
