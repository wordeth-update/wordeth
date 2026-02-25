require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('../models/Plan');

const plans = [
    {
        name: 'Free',
        slug: 'fan-free',
        category: 'fan',
        tier: 0,
        active: true,
        priceMonthly: 0,
        priceYearly: 0,
        description: 'Basic access to Wordeth',
        features: ['Lyric search (with ads)', 'Limited audio rooms', 'Browse packs', 'Watermarked try-on', 'Buy merch'],
        entitlements: [
            { key: 'ADS_LEVEL', value: 'FULL' },
            { key: 'AUDIO_ROOM_LIMIT', value: 2 },
            { key: 'CAN_SAVE_DESIGNS', value: false },
            { key: 'CAN_ACCESS_PAID_DESIGNER_PACKS', value: false },
            { key: 'CAN_ACCESS_LYRIC_PACKS', value: false },
            { key: 'CAN_CUSTOMIZE_MERCH', value: false },
            { key: 'DESIGN_STORAGE_GB', value: 0 },
            { key: 'ANALYTICS_LEVEL', value: 'NONE' }
        ],
        sortOrder: 0
    },
    {
        name: 'Fan+',
        slug: 'fan-plus',
        category: 'fan',
        tier: 1,
        active: true,
        priceMonthly: 3.99,
        priceYearly: 39,
        description: 'Enhanced fan experience',
        features: ['Reduced ads', 'Save designs', 'Basic customization', 'Access free designer templates', 'Design history'],
        entitlements: [
            { key: 'ADS_LEVEL', value: 'REDUCED' },
            { key: 'AUDIO_ROOM_LIMIT', value: 5 },
            { key: 'CAN_SAVE_DESIGNS', value: true },
            { key: 'DESIGN_STORAGE_GB', value: 1 },
            { key: 'CAN_CUSTOMIZE_MERCH', value: true },
            { key: 'DESIGN_HISTORY', value: true },
            { key: 'CAN_ACCESS_PAID_DESIGNER_PACKS', value: false },
            { key: 'CAN_ACCESS_LYRIC_PACKS', value: false },
            { key: 'ANALYTICS_LEVEL', value: 'NONE' }
        ],
        sortOrder: 1
    },
    {
        name: 'Creator',
        slug: 'fan-creator',
        category: 'fan',
        tier: 2,
        active: true,
        priceMonthly: 7.99,
        priceYearly: 79,
        description: 'Full creative toolkit',
        features: ['No ads', 'Full design tools', 'Increased storage', 'Access paid designer packs', 'Access artist lyric packs', 'Priority audio rooms'],
        entitlements: [
            { key: 'ADS_LEVEL', value: 'NONE' },
            { key: 'AUDIO_ROOM_LIMIT', value: -1 },
            { key: 'CAN_SAVE_DESIGNS', value: true },
            { key: 'DESIGN_STORAGE_GB', value: 5 },
            { key: 'CAN_ACCESS_PAID_DESIGNER_PACKS', value: true },
            { key: 'CAN_ACCESS_LYRIC_PACKS', value: true },
            { key: 'CAN_CUSTOMIZE_MERCH', value: true },
            { key: 'DESIGN_HISTORY', value: true },
            { key: 'PRIORITY_AUDIO', value: true },
            { key: 'ANALYTICS_LEVEL', value: 'BASIC' }
        ],
        sortOrder: 2
    },

    {
        name: 'Free Explore',
        slug: 'designer-free',
        category: 'designer',
        tier: 0,
        active: true,
        priceMonthly: 0,
        priceYearly: 0,
        description: 'Start creating and earning',
        features: ['Up to 5 templates', 'Discoverable in marketplace', 'Earn revenue', 'Attribution on designs', 'Standard revenue share'],
        entitlements: [
            { key: 'CAN_CREATE_TEMPLATES', value: true },
            { key: 'TEMPLATE_LIMIT', value: 5 },
            { key: 'HAS_STOREFRONT', value: false },
            { key: 'ANALYTICS_LEVEL', value: 'NONE' },
            { key: 'FEATURED_ELIGIBLE', value: false },
            { key: 'PROMO_TOOLS', value: false },
            { key: 'TEAM_ACCESS', value: false },
            { key: 'DESIGN_STORAGE_GB', value: 0.5 }
        ],
        graduationRules: {
            enabled: true,
            earningsThreshold: 100,
            salesThreshold: 10,
            monthsActiveThreshold: 3
        },
        sortOrder: 0
    },
    {
        name: 'Starter',
        slug: 'designer-starter',
        category: 'designer',
        tier: 1,
        active: true,
        priceMonthly: 15,
        priceYearly: 144,
        description: 'Grow your design business',
        features: ['Up to 20 templates', 'Designer profile', 'Marketplace visibility', 'Basic analytics'],
        entitlements: [
            { key: 'CAN_CREATE_TEMPLATES', value: true },
            { key: 'TEMPLATE_LIMIT', value: 20 },
            { key: 'HAS_STOREFRONT', value: false },
            { key: 'ANALYTICS_LEVEL', value: 'BASIC' },
            { key: 'FEATURED_ELIGIBLE', value: false },
            { key: 'PROMO_TOOLS', value: false },
            { key: 'TEAM_ACCESS', value: false },
            { key: 'DESIGN_STORAGE_GB', value: 2 }
        ],
        sortOrder: 1
    },
    {
        name: 'Pro',
        slug: 'designer-pro',
        category: 'designer',
        tier: 2,
        active: true,
        priceMonthly: 35,
        priceYearly: 336,
        description: 'Professional design studio',
        features: ['Unlimited templates', 'Own storefront', 'Collections & drops', 'Improved revenue share', 'Promo tools'],
        entitlements: [
            { key: 'CAN_CREATE_TEMPLATES', value: true },
            { key: 'TEMPLATE_LIMIT', value: -1 },
            { key: 'HAS_STOREFRONT', value: true },
            { key: 'ANALYTICS_LEVEL', value: 'ADVANCED' },
            { key: 'FEATURED_ELIGIBLE', value: true },
            { key: 'PROMO_TOOLS', value: true },
            { key: 'TEAM_ACCESS', value: false },
            { key: 'DESIGN_STORAGE_GB', value: 10 }
        ],
        sortOrder: 2
    },
    {
        name: 'Studio',
        slug: 'designer-studio',
        category: 'designer',
        tier: 3,
        active: true,
        priceMonthly: 75,
        priceYearly: 720,
        description: 'Full studio experience',
        features: ['Everything in Pro', 'Team access', 'Advanced analytics', 'Featured eligibility', 'Priority support', 'Custom licensing options'],
        entitlements: [
            { key: 'CAN_CREATE_TEMPLATES', value: true },
            { key: 'TEMPLATE_LIMIT', value: -1 },
            { key: 'HAS_STOREFRONT', value: true },
            { key: 'ANALYTICS_LEVEL', value: 'ENTERPRISE' },
            { key: 'FEATURED_ELIGIBLE', value: true },
            { key: 'PROMO_TOOLS', value: true },
            { key: 'TEAM_ACCESS', value: true },
            { key: 'CUSTOM_LICENSING', value: true },
            { key: 'PRIORITY_SUPPORT', value: true },
            { key: 'DESIGN_STORAGE_GB', value: 50 }
        ],
        sortOrder: 3
    },

    {
        name: 'Starter',
        slug: 'artist-starter',
        category: 'artist',
        tier: 1,
        active: true,
        priceMonthly: 49,
        priceYearly: 470,
        description: 'Launch your artist presence',
        features: ['Official artist storefront', 'Official lyric packs', 'Merch monetization', 'Basic analytics'],
        entitlements: [
            { key: 'HAS_STOREFRONT', value: true },
            { key: 'CAN_ACCESS_LYRIC_PACKS', value: true },
            { key: 'CAN_CREATE_TEMPLATES', value: true },
            { key: 'TEMPLATE_LIMIT', value: 20 },
            { key: 'ANALYTICS_LEVEL', value: 'BASIC' },
            { key: 'FEATURED_ELIGIBLE', value: false },
            { key: 'PROMO_TOOLS', value: false },
            { key: 'CAMPAIGN_TOOLS', value: false },
            { key: 'DESIGN_STORAGE_GB', value: 5 }
        ],
        sortOrder: 1
    },
    {
        name: 'Growth',
        slug: 'artist-growth',
        category: 'artist',
        tier: 2,
        active: true,
        priceMonthly: 99,
        priceYearly: 950,
        description: 'Expand your reach',
        features: ['More SKUs', 'Advanced analytics', 'Promo tools', 'Featured eligibility'],
        entitlements: [
            { key: 'HAS_STOREFRONT', value: true },
            { key: 'CAN_ACCESS_LYRIC_PACKS', value: true },
            { key: 'CAN_CREATE_TEMPLATES', value: true },
            { key: 'TEMPLATE_LIMIT', value: -1 },
            { key: 'ANALYTICS_LEVEL', value: 'ADVANCED' },
            { key: 'FEATURED_ELIGIBLE', value: true },
            { key: 'PROMO_TOOLS', value: true },
            { key: 'CAMPAIGN_TOOLS', value: false },
            { key: 'DESIGN_STORAGE_GB', value: 20 }
        ],
        sortOrder: 2
    },
    {
        name: 'Pro',
        slug: 'artist-pro',
        category: 'artist',
        tier: 3,
        active: true,
        priceMonthly: 199,
        priceYearly: 1910,
        description: 'Maximum artist tools',
        features: ['Priority placement', 'Advanced reporting', 'Campaign tools', 'Early access to features'],
        entitlements: [
            { key: 'HAS_STOREFRONT', value: true },
            { key: 'CAN_ACCESS_LYRIC_PACKS', value: true },
            { key: 'CAN_CREATE_TEMPLATES', value: true },
            { key: 'TEMPLATE_LIMIT', value: -1 },
            { key: 'ANALYTICS_LEVEL', value: 'ENTERPRISE' },
            { key: 'FEATURED_ELIGIBLE', value: true },
            { key: 'PROMO_TOOLS', value: true },
            { key: 'CAMPAIGN_TOOLS', value: true },
            { key: 'PRIORITY_PLACEMENT', value: true },
            { key: 'EARLY_FEATURES', value: true },
            { key: 'DESIGN_STORAGE_GB', value: 50 }
        ],
        sortOrder: 3
    },

    {
        name: 'Boutique',
        slug: 'label-boutique',
        category: 'label',
        tier: 1,
        active: true,
        priceMonthly: 499,
        priceYearly: 4790,
        description: 'For small labels (up to 5 artists)',
        features: ['Up to 5 artists', 'Label dashboard', 'Artist management', 'Basic analytics', 'Revenue reporting'],
        maxArtists: 5,
        entitlements: [
            { key: 'LABEL_ARTIST_LIMIT', value: 5 },
            { key: 'HAS_STOREFRONT', value: true },
            { key: 'ANALYTICS_LEVEL', value: 'BASIC' },
            { key: 'HAS_API_ACCESS', value: false },
            { key: 'DEDICATED_SUPPORT', value: false },
            { key: 'DESIGN_STORAGE_GB', value: 20 }
        ],
        sortOrder: 1
    },
    {
        name: 'Mid',
        slug: 'label-mid',
        category: 'label',
        tier: 2,
        active: true,
        priceMonthly: 1250,
        priceYearly: 12000,
        description: 'For growing labels (up to 15 artists)',
        features: ['Up to 15 artists', 'Advanced analytics', 'Priority support', 'Team management'],
        maxArtists: 15,
        entitlements: [
            { key: 'LABEL_ARTIST_LIMIT', value: 15 },
            { key: 'HAS_STOREFRONT', value: true },
            { key: 'ANALYTICS_LEVEL', value: 'ADVANCED' },
            { key: 'HAS_API_ACCESS', value: false },
            { key: 'DEDICATED_SUPPORT', value: false },
            { key: 'PRIORITY_SUPPORT', value: true },
            { key: 'TEAM_ACCESS', value: true },
            { key: 'DESIGN_STORAGE_GB', value: 100 }
        ],
        sortOrder: 2
    },
    {
        name: 'Enterprise',
        slug: 'label-enterprise',
        category: 'label',
        tier: 3,
        active: true,
        priceMonthly: 3000,
        priceYearly: 28800,
        isCustomPricing: true,
        description: 'Custom solutions for major labels',
        features: ['Custom artist count', 'API access', 'Advanced reporting', 'Dedicated support', 'Custom integrations'],
        entitlements: [
            { key: 'LABEL_ARTIST_LIMIT', value: -1 },
            { key: 'HAS_STOREFRONT', value: true },
            { key: 'ANALYTICS_LEVEL', value: 'ENTERPRISE' },
            { key: 'HAS_API_ACCESS', value: true },
            { key: 'DEDICATED_SUPPORT', value: true },
            { key: 'PRIORITY_SUPPORT', value: true },
            { key: 'TEAM_ACCESS', value: true },
            { key: 'DESIGN_STORAGE_GB', value: 500 }
        ],
        sortOrder: 3
    }
];

async function seedPlans() {
    if (process.env.NODE_ENV === 'production') {
        console.error('Seed scripts should not run in production. Set NODE_ENV to development or remove the guard.');
        process.exit(1);
    }

    let mongoUri;
    if (process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
        mongoUri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@wrdthcluster.3kkpz37.mongodb.net/wordeth?retryWrites=true&w=majority&appName=WrdthCluster`;
    } else {
        mongoUri = process.env.MONGODB_URI;
    }

    if (!mongoUri) {
        console.error('No MongoDB URI configured');
        process.exit(1);
    }

    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    for (const planData of plans) {
        await Plan.findOneAndUpdate(
            { slug: planData.slug },
            planData,
            { upsert: true, new: true }
        );
        console.log(`  ✓ ${planData.category}/${planData.name} (${planData.slug})`);
    }

    console.log(`\nSeeded ${plans.length} plans successfully`);
    await mongoose.disconnect();
}

seedPlans().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
