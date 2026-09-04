const mongoose = require('mongoose');

const apliqEventSchema = new mongoose.Schema({
    eventKey: { type: String, required: true, unique: true, index: true },
    type: {
        type: String,
        required: true,
        enum: ['product_upsert', 'fulfillment', 'warehouse_shipment_complete']
    },
    payloadHash: { type: String, required: true },
    status: {
        type: String,
        enum: ['received', 'processing', 'pending_reconciliation', 'processed', 'ignored', 'failed'],
        default: 'received',
        index: true
    },
    referenceIds: [{ type: String }],
    attempts: { type: Number, default: 0 },
    lastReceivedAt: { type: Date, default: Date.now },
    leaseId: { type: String, default: '' },
    leaseUntil: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    error: { type: String, default: '' },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

module.exports = mongoose.models.ApliiqEvent || mongoose.model('ApliiqEvent', apliqEventSchema);