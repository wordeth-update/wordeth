const mongoose = require('mongoose');

const verseReactionSchema = new mongoose.Schema({
    targetType: {
        type: String,
        enum: ['submission', 'match'],
        required: true
    },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        enum: ['cheer', 'fire', 'clap', 'heart', 'mind_blown'],
        required: true
    }
}, { timestamps: true });

verseReactionSchema.index({ targetType: 1, targetId: 1, userId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('VerseReaction', verseReactionSchema);
