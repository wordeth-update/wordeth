const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
    amount: { type: Number, required: true, min: 1 },
    side: { type: String, default: '' },
    paidOut: { type: Boolean, default: false }
}, { _id: false });

const wagerSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['tournament_match', 'verse_game'],
        required: true
    },
    creatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    matchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VerseMatch',
        default: null
    },
    roomId: {
        type: String,
        default: null
    },
    roomName: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: '',
        maxlength: 200
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    participants: [participantSchema],
    status: {
        type: String,
        enum: ['open', 'active', 'resolved', 'cancelled', 'expired'],
        default: 'open',
        index: true
    },
    winnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    winnerSide: {
        type: String,
        default: null
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

wagerSchema.index({ creatorId: 1, status: 1 });
wagerSchema.index({ matchId: 1, status: 1 });
wagerSchema.index({ roomId: 1, status: 1 });
wagerSchema.index({ 'participants.userId': 1 });

module.exports = mongoose.model('Wager', wagerSchema);
