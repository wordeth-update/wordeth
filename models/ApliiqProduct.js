const mongoose = require('mongoose');

const apliqVariantSchema = new mongoose.Schema({
    sku: { type: String, required: true, trim: true },
    price: { type: Number, default: 0 },
    color: { type: String, default: '' },
    size: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    weight: { type: Number, default: 0 },
    weightUnit: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    length: { type: Number, default: 0 },
    dimensionUnit: { type: String, default: '' }
}, { _id: false });

const productReviewSchema = new mongoose.Schema({
    action: {
        type: String,
        enum: ['approved', 'archived', 'mapped', 'changes_received'],
        required: true
    },
    actorId: { type: String, required: true },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now }
}, { _id: false });

const apliqProductSchema = new mongoose.Schema({
    identityKey: { type: String, required: true, unique: true, index: true },
    storeProductId: { type: String, required: true, unique: true, index: true },
    shippingProfileId: { type: String, default: '' },
    taxonomyId: { type: String, default: '' },
    type: { type: String, default: '', trim: true },
    name: { type: String, required: true, trim: true },
    currency: { type: String, default: 'USD', uppercase: true },
    description: { type: String, default: '' },
    imageUrls: [{ type: String }],
    sizes: [{ type: String }],
    colors: [{ type: String }],
    variants: { type: [apliqVariantSchema], default: [] },
    replaceProduct: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ['pending', 'approved', 'archived'],
        default: 'pending',
        index: true
    },
    wordethProduct: {
        type: String,
        enum: ['', 'tshirt', 'hoodie', 'tank', 'longsleeve', 'sweatshirt', 'hat'],
        default: '',
        index: true
    },
    reviewHistory: { type: [productReviewSchema], default: [] },
    lastPayloadHash: { type: String, default: '' },
    lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true });

apliqProductSchema.index({ name: 'text', type: 'text', 'variants.sku': 'text' });
apliqProductSchema.index({ 'variants.sku': 1 });

module.exports = mongoose.models.ApliiqProduct || mongoose.model('ApliiqProduct', apliqProductSchema);