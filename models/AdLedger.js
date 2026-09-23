'use strict';

const mongoose = require('mongoose');

/**
 * Every movement of an advertiser's money, in one place.
 *
 * Credits come from a completed Stripe payment; debits come from ads being
 * shown and clicked. Nothing adjusts a balance without writing a row here,
 * so the balance is always explainable and a statement is a query rather
 * than a reconstruction. Amounts are in dollars, positive for credit and
 * negative for spend.
 */
const adLedgerSchema = new mongoose.Schema({
    advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Advertiser', required: true, index: true },
    type: {
        type: String,
        enum: ['top_up', 'impression', 'click', 'refund', 'adjustment'],
        required: true,
        index: true
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', default: null, index: true },
    description: { type: String, default: '' },
    /** Set on a top-up so one Stripe payment can never be credited twice. */
    stripeSessionId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: false });

// Unique only among rows that actually carry a payment reference. A sparse
// index would still treat every spend row's empty reference as a value and
// collide on the second one, which silently loses ledger rows.
adLedgerSchema.index(
    { stripeSessionId: 1 },
    { unique: true, partialFilterExpression: { stripeSessionId: { $type: 'string' } } }
);
adLedgerSchema.index({ advertiserId: 1, createdAt: -1 });

module.exports = mongoose.models.AdLedger || mongoose.model('AdLedger', adLedgerSchema);
