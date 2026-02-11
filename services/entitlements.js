const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');

const ENTITLEMENT_DEFAULTS = {
    ADS_LEVEL: 'FULL',
    AUDIO_ROOM_LIMIT: 2,
    CAN_SAVE_DESIGNS: false,
    DESIGN_STORAGE_GB: 0,
    CAN_ACCESS_PAID_DESIGNER_PACKS: false,
    CAN_ACCESS_LYRIC_PACKS: false,
    CAN_CREATE_TEMPLATES: false,
    TEMPLATE_LIMIT: 0,
    HAS_STOREFRONT: false,
    LABEL_ARTIST_LIMIT: 0,
    HAS_API_ACCESS: false,
    ANALYTICS_LEVEL: 'NONE',
    FEATURED_ELIGIBLE: false,
    CAN_CUSTOMIZE_MERCH: false,
    DESIGN_HISTORY: false,
    PRIORITY_AUDIO: false,
    PROMO_TOOLS: false,
    TEAM_ACCESS: false,
    CUSTOM_LICENSING: false,
    PRIORITY_SUPPORT: false,
    CAMPAIGN_TOOLS: false,
    EARLY_FEATURES: false,
    PRIORITY_PLACEMENT: false,
    DEDICATED_SUPPORT: false
};

async function getUserEntitlements(user) {
    const entitlements = { ...ENTITLEMENT_DEFAULTS };

    let plan = null;
    if (user.subscriptionId) {
        const subscription = await Subscription.findById(user.subscriptionId);
        if (subscription && subscription.isActive()) {
            plan = await Plan.findById(subscription.planId);
        }
    }

    if (!plan) {
        const acctType = user.accountType || 'fan';
        plan = await Plan.findOne({ slug: `${acctType}-free`, active: true });
        if (!plan) {
            plan = await Plan.findOne({ slug: `${acctType}-starter`, active: true });
        }
    }

    if (plan && plan.entitlements) {
        for (const ent of plan.entitlements) {
            entitlements[ent.key] = ent.value;
        }
    }

    if (user.entitlementOverrides && user.entitlementOverrides.size > 0) {
        for (const [key, value] of user.entitlementOverrides) {
            entitlements[key] = value;
        }
    }

    return entitlements;
}

function checkEntitlement(requiredKey, requiredValue) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: 'Authentication required' });
            }

            const entitlements = await getUserEntitlements(req.user);
            req.entitlements = entitlements;

            const actualValue = entitlements[requiredKey];

            if (typeof requiredValue === 'boolean') {
                if (actualValue !== requiredValue) {
                    return res.status(403).json({
                        message: 'Upgrade required',
                        requiredEntitlement: requiredKey,
                        currentValue: actualValue
                    });
                }
            } else if (typeof requiredValue === 'number') {
                if (typeof actualValue === 'number' && actualValue < requiredValue) {
                    return res.status(403).json({
                        message: 'Upgrade required',
                        requiredEntitlement: requiredKey,
                        currentValue: actualValue,
                        requiredValue
                    });
                }
            } else if (typeof requiredValue === 'string') {
                const levels = { 'NONE': 0, 'BASIC': 1, 'ADVANCED': 2, 'ENTERPRISE': 3, 'FULL': 3, 'REDUCED': 1 };
                const actualLevel = levels[actualValue] || 0;
                const requiredLevel = levels[requiredValue] || 0;
                if (actualLevel < requiredLevel) {
                    return res.status(403).json({
                        message: 'Upgrade required',
                        requiredEntitlement: requiredKey,
                        currentValue: actualValue
                    });
                }
            }

            next();
        } catch (error) {
            console.error('Entitlement check error:', error);
            res.status(500).json({ message: 'Server error checking entitlements' });
        }
    };
}

function checkGraduation(user) {
    if (user.accountType !== 'designer') return { graduated: false };

    const earnings = user.creatorProfile?.totalEarnings || 0;
    const sales = user.creatorProfile?.totalSales || 0;
    const months = user.creatorProfile?.monthsActive || 0;

    const graduated = earnings >= 100 || sales >= 10 || months >= 3;

    return {
        graduated,
        earnings,
        sales,
        months,
        thresholds: { earnings: 100, sales: 10, months: 3 }
    };
}

module.exports = {
    getUserEntitlements,
    checkEntitlement,
    checkGraduation,
    ENTITLEMENT_DEFAULTS
};
