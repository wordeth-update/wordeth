const mongoose = require('mongoose');

// One ledger entry per (room, recipient). payoutId is the idempotency marker
// applied to the recipient's User document in the same atomic update as the
// credit — retries become no-ops. The recovery sweep finishes any entry left
// unsettled by a crash.
const settlementEntrySchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    recipientUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    payoutId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, min: 0 },
    splitPercent: { type: Number, required: true },
    status: {
        type: String,
        enum: ['unsettled', 'settled'],
        default: 'unsettled',
        index: true
    },
    settledAt: { type: Date, default: null }
}, { timestamps: true });

settlementEntrySchema.index({ roomId: 1, recipientUserId: 1 }, { unique: true });
settlementEntrySchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('SettlementEntry', settlementEntrySchema);
