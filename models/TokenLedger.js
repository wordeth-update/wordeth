const mongoose = require('mongoose');

const tokenLedgerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['monthly_grant', 'pack_purchase', 'room_entry', 'room_earning', 'creator_payout', 'admin_adjustment', 'replay_play', 'boost_purchase', 'tip', 'tip_refund', 'room_split_payout', 'snippet_rental', 'wager_create', 'wager_accept', 'wager_win', 'wager_refund'],
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    balanceBefore: {
        type: Number,
        required: true
    },
    balanceAfter: {
        type: Number,
        required: true
    },
    relatedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    roomId: {
        type: String,
        default: null
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

tokenLedgerSchema.index({ userId: 1, createdAt: -1 });
tokenLedgerSchema.index({ type: 1, createdAt: -1 });
tokenLedgerSchema.index({ relatedUserId: 1, type: 1 });

module.exports = mongoose.model('TokenLedger', tokenLedgerSchema);
