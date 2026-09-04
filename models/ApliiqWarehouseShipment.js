const mongoose = require('mongoose');

const warehouseItemSchema = new mongoose.Schema({
    itemId: { type: String, default: '' },
    inventoryId: { type: String, default: '' },
    name: { type: String, default: '' },
    type: { type: String, default: '' },
    quantityExpected: { type: Number, default: 0 },
    quantityReceived: { type: Number, default: 0 },
    isActivated: { type: Boolean, default: false },
    receivingErrors: { type: String, default: '' }
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