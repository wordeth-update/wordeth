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
        // The first four are the website's. The app-* ones are slots in the
        // phone app; what each looks like is in services/appAds.js.
        enum: ['header', 'footer', 'sidebar', 'lyrics-bottom',
               'app-lyrics', 'app-messages', 'app-room-strip', 'app-photo-slide', 'app-merch', 'app-takeover'],
        default: 'header'
    },
    size: {
        type: String,
        // Banners have pixel sizes. App placements are drawn by the app in
        // its own shapes, so theirs name the shape rather than a size.
        enum: ['728x90', '320x50', '300x250', 'native', 'slide', 'takeover'],
        required: true
    },
    /** The words on the button, in the app: "Shop now". Empty means "Learn more". */
    cta: { type: String, maxlength: 24, default: '' },
    /** People may pound this advertiser to chat, from the ad. Needs a chat account on the advertiser. */
    chatEnabled: { type: Boolean, default: false },
    /** A sponsor break in a paid room. Only meaningful for app-takeover. */
    takeover: {
        format: { type: String, enum: ['video', 'audio', 'skyscraper'], default: 'skyscraper' },
        /** The video or audio file. A skyscraper uses imageUrl. */
        mediaUrl: { type: String, default: '' },
        durationSec: { type: Number, default: 30, min: 5, max: 90 },
        /** What the host reads. Shown to the host only. */
        script: { type: String, maxlength: 1500, default: '' },
        /** Hosts who may run it. Empty means any host of a paid room. */
        hostUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
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
        /** Dollars a day, and in total. Zero on either means no cap there. */
        daily: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        spent: { type: Number, default: 0 },
        /** Today's running total, and the day it belongs to, so a new day starts clean. */
        spentToday: { type: Number, default: 0 },
        spentDate: { type: String, default: null }
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
    },
    /**
     * When this ad last started running: created live, approved, or resumed.
     * The on-ramp is measured from here (services/adRamp.js). Ads from before
     * on-ramps existed have none, and are at full strength. No default on
     * purpose: a default is filled in every time an old ad is read, which
     * would put every ad from before this field back at the start, forever.
     */
    rampStartedAt: { type: Date }
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

/**
 * Everything that makes an ad servable apart from relevance: active, inside
 * its dates, inside both budgets. Shared by the website's matcher and the
 * app's, so the two cannot drift apart on what "running" means.
 */
adSchema.statics.runningQuery = function() {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    return {
        status: 'active',
        $and: [
            { $or: [{ 'schedule.startDate': { $exists: false } }, { 'schedule.startDate': null }, { 'schedule.startDate': { $lte: now } }] },
            { $or: [{ 'schedule.endDate': { $exists: false } }, { 'schedule.endDate': null }, { 'schedule.endDate': { $gte: now } }] },
            { $or: [{ 'budget.total': { $lte: 0 } }, { $expr: { $lt: ['$budget.spent', '$budget.total'] } }] },
            { $or: [
                { 'budget.daily': { $lte: 0 } },
                { 'budget.spentDate': { $ne: today } },
                { $expr: { $lt: ['$budget.spentToday', '$budget.daily'] } }
            ] }
        ]
    };
};

adSchema.statics.findMatchingAds = async function(searchTerm, placement = null) {
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (!searchWords.length) return [];

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const query = {
        status: 'active',
        keywords: { $in: searchWords },
        // Inside its run dates, if it has any.
        $and: [
            { $or: [{ 'schedule.startDate': { $exists: false } }, { 'schedule.startDate': null }, { 'schedule.startDate': { $lte: now } }] },
            { $or: [{ 'schedule.endDate': { $exists: false } }, { 'schedule.endDate': null }, { 'schedule.endDate': { $gte: now } }] },
            // Total budget not yet spent (zero means uncapped).
            { $or: [{ 'budget.total': { $lte: 0 } }, { $expr: { $lt: ['$budget.spent', '$budget.total'] } }] },
            // Today's budget not yet spent. A stale date means today has not started.
            { $or: [
                { 'budget.daily': { $lte: 0 } },
                { 'budget.spentDate': { $ne: today } },
                { $expr: { $lt: ['$budget.spentToday', '$budget.daily'] } }
            ] }
        ]
    };
    if (placement) {
        query.placement = placement;
    }

    // An empty account serves nothing. Checked here so it holds for every caller.
    const funded = await require('../services/adCredit').fundedAdvertiserIds();
    if (!funded.length) return [];
    query.advertiserId = { $in: funded };

    const ads = await this.find(query).populate('advertiserId', 'companyName');

    const scoredAds = ads.map(ad => {
        let score = 0;
        ad.keywords.forEach(keyword => {
            if (searchWords.includes(keyword)) score += 1;
        });
        return { ad, score };
    });

    scoredAds.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.ad.pricing.cpm - a.ad.pricing.cpm;
    });

    // The best-fitting ads share the slot by bid and on-ramp strength; the
    // one drawn goes to the front, which is the one callers show.
    if (scoredAds.length > 1) {
        const best = scoredAds[0].score;
        const tied = scoredAds.filter(item => item.score === best);
        if (tied.length > 1) {
            const winner = require('../services/adRamp').share(tied.map(item => item.ad));
            const at = scoredAds.findIndex(item => item.ad === winner);
            if (at > 0) scoredAds.unshift(scoredAds.splice(at, 1)[0]);
        }
    }

    return scoredAds.map(item => item.ad);
};

adSchema.index({ keywords: 1, status: 1, placement: 1 });

module.exports = mongoose.model('Ad', adSchema);
