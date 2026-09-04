const mongoose = require('mongoose');

const merchOrderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: String, required: true },
    productName: { type: String, required: true },
    color: { type: String, required: true },
    colorName: { type: String },
    size: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    artistName: String,
    artistId: String,
    frontDesign: String,
    backDesign: String,
    leftDesign: String,
    rightDesign: String,
    designPreview: String,
    templateId: String,
    status: {
        type: String,
        default: 'pending',
        enum: ['pending', 'confirmed', 'production', 'shipped', 'delivered', 'cancelled']
    },
    trackingNumber: String,
    notes: String,
    apliiq: {
        orderId: { type: String, default: '', index: true },
        status: { type: String, default: '' },
        trackingCompany: { type: String, default: '' },
        trackingNumbers: [{ type: String }],
        trackingUrls: [{ type: String }],
        primaryTracking: {
            number: { type: String, default: '' },
            company: { type: String, default: '' },
            url: { type: String, default: '' }
        },
        lineItems: { type: [mongoose.Schema.Types.Mixed], default: [] },
        shippedAt: { type: Date, default: null },
        lastEventAt: { type: Date, default: null }
    }
}, { timestamps: true });

module.exports = mongoose.models.MerchOrder || mongoose.model('MerchOrder', merchOrderSchema);