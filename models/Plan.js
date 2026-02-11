const mongoose = require('mongoose');

const entitlementValueSchema = new mongoose.Schema({
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: false });

const planSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['fan', 'designer', 'artist', 'label'],
        index: true
    },
    tier: {
        type: Number,
        required: true,
        default: 0
    },
    priceMonthly: {
        type: Number,
        default: 0
    },
    priceYearly: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    description: {
        type: String,
        default: ''
    },
    features: [{
        type: String
    }],
    entitlements: [entitlementValueSchema],
    graduationRules: {
        enabled: { type: Boolean, default: false },
        earningsThreshold: { type: Number, default: null },
        salesThreshold: { type: Number, default: null },
        monthsActiveThreshold: { type: Number, default: null }
    },
    maxArtists: {
        type: Number,
        default: null
    },
    isCustomPricing: {
        type: Boolean,
        default: false
    },
    active: {
        type: Boolean,
        default: true
    },
    sortOrder: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

planSchema.index({ category: 1, tier: 1 });
planSchema.index({ slug: 1 });

module.exports = mongoose.model('Plan', planSchema);
