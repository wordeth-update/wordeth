const mongoose = require('mongoose');

const issueAuditSchema = new mongoose.Schema({
    action: { type: String, enum: ['acknowledged', 'resolved'], required: true },
    actorId: { type: String, required: true },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now }
}, { _id: false });

const warehouseItemSchema = new mongoose.Schema({
    issueKey: { type: String, required: true },
    itemId: { type: String, default: '' },
    inventoryId: { type: String, default: '' },
    name: { type: String, default: '' },
    type: { type: String, default: '' },
    quantityExpected: { type: Number, default: 0 },
    quantityReceived: { type: Number, default: 0 },
    isActivated: { type: Boolean, default: false },
    receivingErrors: { type: String, default: '' },
    presentInLatestReport: { type: Boolean, default: true },
    issueStatus: {
        type: String,
        enum: ['open', 'acknowledged', 'resolved'],
        default: 'open'
    },
    issueAudit: { type: [issueAuditSchema], default: [] }
}, { _id: false });

const warehouseShipmentSchema = new mongoose.Schema({
    shipmentId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    items: { type: [warehouseItemSchema], default: [] },
    hasDiscrepancies: { type: Boolean, default: false },
    completedAt: { type: Date, default: Date.now },
    lastPayloadHash: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.models.ApliiqWarehouseShipment ||
    mongoose.model('ApliiqWarehouseShipment', warehouseShipmentSchema);