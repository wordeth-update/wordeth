const mongoose = require('mongoose');

const verseSubmissionSchema = new mongoose.Schema({
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseRound', required: true, index: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'VerseSeason', required: true, index: true },
    artistUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submissionType: {
        type: String,
        enum: ['original', 'cover'],
        required: true,
        default: 'original'
    },
    title: { type: String, required: true, trim: true },
    lyricsText: { type: String, required: true },
    audioUrl: { type: String, default: '' },
    audioDurationSec: { type: Number, default: 0 },
    livePerformanceSlot: { type: Date, default: null },
    originalSong: {
        songTitle: { type: String, default: '' },
        originalArtist: { type: String, default: '' },
        source: { type: String, default: '' }
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'withdrawn'],
        default: 'pending',
        index: true
    },
    moderationNotes: { type: String, default: '' },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null },
    ownershipConfirmed: { type: Boolean, required: true, default: false },
    reactionCounts: {
        cheer: { type: Number, default: 0 },
        fire: { type: Number, default: 0 },
        clap: { type: Number, default: 0 },
        heart: { type: Number, default: 0 },
        mind_blown: { type: Number, default: 0 }
    },
    totalReactions: { type: Number, default: 0 },
    seed: { type: Number, default: null }
}, { timestamps: true });

verseSubmissionSchema.index({ roundId: 1, artistUserId: 1 }, { unique: true });
verseSubmissionSchema.index({ seasonId: 1, status: 1 });
verseSubmissionSchema.index({ submissionType: 1 });

module.exports = mongoose.model('VerseSubmission', verseSubmissionSchema);
