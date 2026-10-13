const mongoose = require('mongoose');

/**
 * A creator asking for their token earnings as money.
 *
 * The tokens leave their earnings the moment they ask, so the same tokens
 * cannot be asked for twice. If the request is turned down they go back.
 * Paying is a Stripe transfer to the creator's connected account; Stripe
 * then pays their bank on its own schedule.
 */
const payoutRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokens: { type: Number, required: true, min: 1 },
    amountUsd: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true },
    status: { type: String, enum: ['requested', 'paid', 'rejected', 'failed', 'cancelled'], default: 'requested', index: true },
    stripeAccountId: { type: String, default: null },
    stripeTransferId: { type: String, default: null },
    note: { type: String, default: '' },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    error: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('PayoutRequest', payoutRequestSchema);
