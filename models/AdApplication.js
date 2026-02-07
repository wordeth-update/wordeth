const mongoose = require('mongoose');

const adApplicationSchema = new mongoose.Schema({
    contactName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    companyName: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    website: {
        type: String,
        trim: true
    },
    businessType: {
        type: String,
        required: true,
        enum: [
            'brand',
            'record-label',
            'independent-artist',
            'retailer',
            'tech-company',
            'event-promoter',
            'media-entertainment',
            'agency',
            'nonprofit',
            'other'
        ]
    },
    businessTypeOther: {
        type: String,
        trim: true
    },
    businessDescription: {
        type: String,
        required: true,
        trim: true
    },
    monthlyBudget: {
        type: String,
        required: true,
        enum: [
            'under-500',
            '500-2000',
            '2000-5000',
            '5000-10000',
            '10000-25000',
            '25000-plus'
        ]
    },
    campaignGoals: [{
        type: String,
        enum: [
            'brand-awareness',
            'website-traffic',
            'product-sales',
            'event-promotion',
            'app-downloads',
            'audience-growth',
            'other'
        ]
    }],
    campaignGoalsOther: {
        type: String,
        trim: true
    },
    targetAudience: {
        type: String,
        required: true,
        trim: true
    },
    targetGenres: [{
        type: String,
        trim: true
    }],
    previousAdvertising: {
        type: String,
        required: true,
        enum: ['yes-digital', 'yes-traditional', 'yes-both', 'no']
    },
    expectedStartDate: {
        type: String,
        required: true,
        enum: ['immediately', 'within-2-weeks', 'within-month', 'within-quarter', 'exploring']
    },
    additionalNotes: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'under-review', 'approved', 'rejected'],
        default: 'pending'
    },
    reviewNotes: {
        type: String,
        trim: true
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Advertiser'
    },
    reviewedAt: {
        type: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AdApplication', adApplicationSchema);
