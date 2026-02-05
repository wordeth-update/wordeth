const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
    advertiserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Advertiser',
        required: true
    },
    title: {
        type: String,
        required: true,
        maxlength: 100
    },
    description: {
        type: String,
        maxlength: 200
    },
    imageUrl: {
        type: String,
        required: true
    },
    linkUrl: {
        type: String,
        required: true
    },
    placement: {
        type: String,
        enum: ['header', 'footer', 'sidebar'],
        default: 'header'
    },
    size: {
        type: String,
        enum: ['728x90', '320x50', '300x250'],
        required: true
    },
    keywords: [{
        type: String,
        lowercase: true,
        trim: true
    }],
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'paused', 'active'],
        default: 'pending'
    },
    createdBy: {
        type: String,
        enum: ['admin', 'self-serve'],
        default: 'self-serve'
    },
    budget: {
        daily: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        spent: { type: Number, default: 0 }
    },
    pricing: {
        cpm: { type: Number, default: 2.00 },
        cpc: { type: Number, default: 0.10 }
    },
    stats: {
        impressions: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 }
    },
    schedule: {
        startDate: { type: Date, default: Date.now },
        endDate: { type: Date }
    }
}, {
    timestamps: true
});

adSchema.index({ keywords: 1 });
adSchema.index({ status: 1 });
adSchema.index({ advertiserId: 1 });

adSchema.virtual('ctr').get(function() {
    if (this.stats.impressions === 0) return 0;
    return ((this.stats.clicks / this.stats.impressions) * 100).toFixed(2);
});

adSchema.methods.matchesKeywords = function(searchTerms) {
    const searchLower = searchTerms.toLowerCase();
    let matchScore = 0;
    
    this.keywords.forEach(keyword => {
        if (searchLower.includes(keyword)) {
            matchScore += 1;
        }
    });
    
    return matchScore;
};

adSchema.statics.findMatchingAds = async function(searchTerm, placement = null) {
    const query = { status: 'active' };
    if (placement) {
        query.placement = placement;
    }
    
    const ads = await this.find(query).populate('advertiserId', 'companyName');
    const searchLower = searchTerm.toLowerCase();
    
    const scoredAds = ads.map(ad => {
        let score = 0;
        ad.keywords.forEach(keyword => {
            if (searchLower.includes(keyword)) {
                score += 1;
            }
        });
        return { ad, score };
    }).filter(item => item.score > 0);
    
    scoredAds.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.ad.pricing.cpm - a.ad.pricing.cpm;
    });
    
    return scoredAds.map(item => item.ad);
};

module.exports = mongoose.model('Ad', adSchema);
