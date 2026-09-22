'use strict';

const mongoose = require('mongoose');

/**
 * One row per Apple transaction ever credited. The unique index on
 * transactionId is what makes crediting idempotent: a phone that retries,
 * or a hostile client that replays a signed transaction, writes nothing the
 * second time.
 */
const applePurchaseSchema = new mongoose.Schema({
    transactionId: { type: String, required: true, unique: true, index: true },
    originalTransactionId: { type: String, default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    tokens: { type: Number, required: true },
    environment: { type: String, enum: ['sandbox', 'production'], required: true }
}, { timestamps: true });

module.exports = mongoose.models.ApplePurchase || mongoose.model('ApplePurchase', applePurchaseSchema);
