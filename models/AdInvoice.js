'use strict';

const mongoose = require('mongoose');

/**
 * An invoice for an advertiser on credit terms.
 *
 * Raised for a closed period, it carries the delivery it covers and a due
 * date computed from the account's agreed terms, thirty days by default. An
 * invoice past its due date and unpaid marks the account, which stops
 * further delivery until it is settled: credit is extended, not given away.
 */
const lineSchema = new mongoose.Schema({
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', default: null },
    title: { type: String, default: '' },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    amount: { type: Number, required: true }
}, { _id: false });

const adInvoiceSchema = new mongoose.Schema({
    /** Human reference, e.g. WA-2026-09-0007. */
    number: { type: String, required: true, unique: true, index: true },
    advertiserId: { type: mongoose.Schema.Types.ObjectId, ref: 'Advertiser', required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    lines: { type: [lineSchema], default: [] },
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    currency: { type: String, default: 'usd' },
    status: {
        type: String,
        enum: ['open', 'paid', 'void'],
        default: 'open',
        index: true
    },
    issuedAt: { type: Date, default: Date.now },
    dueAt: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    /** Set when paid by card rather than bank transfer. */
    stripeSessionId: { type: String, default: null },
    notes: { type: String, default: '' }
}, { timestamps: true });

adInvoiceSchema.index({ advertiserId: 1, status: 1, dueAt: 1 });

/** Unpaid and past its due date. */
adInvoiceSchema.virtual('overdue').get(function () {
    return this.status === 'open' && this.dueAt < new Date();
});

adInvoiceSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.models.AdInvoice || mongoose.model('AdInvoice', adInvoiceSchema);
