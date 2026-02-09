const mongoose = require('mongoose');

const merchSaleSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        index: true
    },
    labelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Label',
        required: true,
        index: true
    },
    artistName: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    artistSlug: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    sku: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    productName: {
        type: String,
        required: true,
        trim: true
    },
    productType: {
        type: String,
        enum: ['t-shirt', 'hoodie', 'hat', 'poster', 'vinyl', 'cd', 'accessories', 'other'],
        default: 'other'
    },
    songTitle: {
        type: String,
        default: '',
        trim: true
    },
    albumTitle: {
        type: String,
        default: '',
        trim: true
    },
    lyricsSnippet: {
        type: String,
        default: '',
        trim: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    unitPrice: {
        type: Number,
        required: true,
        min: 0
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    revenueShare: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    geo: {
        country: { type: String, default: '' },
        countryCode: { type: String, default: '' },
        region: { type: String, default: '' },
        city: { type: String, default: '' },
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 }
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'shipped', 'delivered', 'refunded', 'cancelled'],
        default: 'confirmed'
    },
    saleDate: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

merchSaleSchema.index({ labelId: 1, saleDate: -1 });
merchSaleSchema.index({ labelId: 1, artistSlug: 1, saleDate: -1 });
merchSaleSchema.index({ labelId: 1, sku: 1 });
merchSaleSchema.index({ 'geo.countryCode': 1, labelId: 1 });

module.exports = mongoose.model('MerchSale', merchSaleSchema);
