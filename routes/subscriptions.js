const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { loadEntitlements } = require('../middleware/rbac');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const EventsLedger = require('../models/EventsLedger');
const TokenLedger = require('../models/TokenLedger');
const User = require('../models/User');
const { getUserEntitlements, checkGraduation } = require('../services/entitlements');

const PLAN_TOKEN_GRANTS = {
    'fan-plus': 50,
    'fan-creator': 100,
    'designer-starter': 25,
    'designer-pro': 50,
    'designer-studio': 75,
    'artist-starter': 50,
    'artist-growth': 100,
    'artist-pro': 135,
    'label-boutique': 100,
    'label-mid': 150,
    'label-enterprise': 200
};

async function grantTokensForPlan(user, planSlug) {
    const tokenAmount = PLAN_TOKEN_GRANTS[planSlug];
    if (!tokenAmount || tokenAmount <= 0) return null;

    const targetUser = await User.findById(user._id);
    if (!targetUser) return null;

    const balanceBefore = targetUser.tokenBalance || 0;
    targetUser.tokenBalance = balanceBefore + tokenAmount;
    await targetUser.save();

    await TokenLedger.create({
        userId: targetUser._id,
        type: 'monthly_grant',
        amount: tokenAmount,
        balanceBefore,
        balanceAfter: targetUser.tokenBalance,
        metadata: { planSlug, grantType: 'subscription' }
    });

    return { tokenAmount, newBalance: targetUser.tokenBalance };
}

router.get('/plans', async (req, res) => {
    try {
        const { category } = req.query;
        const filter = { active: true };
        if (category) filter.category = category;
        const plans = await Plan.find(filter).sort({ category: 1, tier: 1, sortOrder: 1 });
        res.json({ plans });
    } catch (error) {
        console.error('Error fetching plans:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/plans/:slug', async (req, res) => {
    try {
        const plan = await Plan.findOne({ slug: req.params.slug, active: true });
        if (!plan) return res.status(404).json({ message: 'Plan not found' });
        res.json({ plan });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/my-subscription', auth, async (req, res) => {
    try {
        let subscription = null;
        let plan = null;

        if (req.user.subscriptionId) {
            subscription = await Subscription.findById(req.user.subscriptionId);
            if (subscription) {
                plan = await Plan.findById(subscription.planId);
            }
        }

        if (!plan) {
            const freePlanSlug = `${req.user.accountType || 'fan'}-free`;
            plan = await Plan.findOne({ slug: freePlanSlug, active: true });
        }

        const entitlements = await getUserEntitlements(req.user);
        const graduation = checkGraduation(req.user);

        res.json({
            subscription: subscription ? {
                id: subscription._id,
                status: subscription.status,
                billingCycle: subscription.billingCycle,
                currentPeriodStart: subscription.currentPeriodStart,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                nextBillingAmount: subscription.nextBillingAmount,
                isActive: subscription.isActive()
            } : null,
            plan: plan ? {
                id: plan._id,
                name: plan.name,
                slug: plan.slug,
                category: plan.category,
                tier: plan.tier,
                priceMonthly: plan.priceMonthly,
                priceYearly: plan.priceYearly,
                features: plan.features
            } : null,
            entitlements,
            graduation,
            accountType: req.user.accountType,
            role: req.user.role
        });
    } catch (error) {
        console.error('Error fetching subscription:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/my-entitlements', auth, async (req, res) => {
    try {
        const entitlements = await getUserEntitlements(req.user);
        res.json({ entitlements, accountType: req.user.accountType, role: req.user.role });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/subscribe', auth, async (req, res) => {
    try {
        const { planSlug, billingCycle } = req.body;

        const plan = await Plan.findOne({ slug: planSlug, active: true });
        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        if (plan.priceMonthly === 0 && plan.priceYearly === 0) {
            return res.status(400).json({ message: 'Cannot subscribe to a free plan via checkout' });
        }

        const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
        const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;

        const now = new Date();
        const periodEnd = new Date(now);
        if (cycle === 'yearly') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        if (req.user.subscriptionId) {
            const existingSub = await Subscription.findById(req.user.subscriptionId);
            if (existingSub && existingSub.isActive()) {
                const oldPlan = await Plan.findById(existingSub.planId);
                existingSub.planId = plan._id;
                existingSub.billingCycle = cycle;
                existingSub.currentPeriodStart = now;
                existingSub.currentPeriodEnd = periodEnd;
                existingSub.nextBillingAmount = amount;
                existingSub.status = 'active';
                existingSub.cancelAtPeriodEnd = false;
                existingSub.canceledAt = null;
                await existingSub.save();

                const isUpgrade = plan.tier > (oldPlan?.tier || 0);
                await EventsLedger.create({
                    actorId: req.user._id,
                    actorType: 'user',
                    eventType: isUpgrade ? 'subscription_upgraded' : 'subscription_downgraded',
                    resourceType: 'subscription',
                    resourceId: existingSub._id,
                    amount,
                    metadata: { planSlug, billingCycle: cycle, previousPlan: oldPlan?.slug }
                });

                req.user.accountType = plan.category;
                const roleMap = { fan: 'USER_FAN', designer: 'DESIGNER', artist: 'ARTIST', label: 'LABEL_ADMIN' };
                req.user.role = roleMap[plan.category] || 'USER_FAN';
                await req.user.save();

                const upgradeGrant = await grantTokensForPlan(req.user, planSlug);

                return res.json({ message: 'Subscription updated', subscription: existingSub, tokenGrant: upgradeGrant });
            }
        }

        const subscription = new Subscription({
            userId: req.user._id,
            planId: plan._id,
            status: 'active',
            billingCycle: cycle,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            nextBillingAmount: amount
        });
        await subscription.save();

        req.user.subscriptionId = subscription._id;
        req.user.accountType = plan.category;
        const roleMap = { fan: 'USER_FAN', designer: 'DESIGNER', artist: 'ARTIST', label: 'LABEL_ADMIN' };
        req.user.role = roleMap[plan.category] || 'USER_FAN';
        await req.user.save();

        await EventsLedger.create({
            actorId: req.user._id,
            actorType: 'user',
            eventType: 'subscription_created',
            resourceType: 'subscription',
            resourceId: subscription._id,
            amount,
            metadata: { planSlug, billingCycle: cycle }
        });

        const tokenGrant = await grantTokensForPlan(req.user, planSlug);

        res.status(201).json({ message: 'Subscription created', subscription, tokenGrant });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/cancel', auth, async (req, res) => {
    try {
        if (!req.user.subscriptionId) {
            return res.status(400).json({ message: 'No active subscription' });
        }

        const subscription = await Subscription.findById(req.user.subscriptionId);
        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        subscription.cancelAtPeriodEnd = true;
        subscription.canceledAt = new Date();
        await subscription.save();

        await EventsLedger.create({
            actorId: req.user._id,
            actorType: 'user',
            eventType: 'subscription_canceled',
            resourceType: 'subscription',
            resourceId: subscription._id,
            metadata: { effectiveDate: subscription.currentPeriodEnd }
        });

        res.json({
            message: 'Subscription will cancel at end of billing period',
            cancelAt: subscription.currentPeriodEnd
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/record-gmv', auth, async (req, res) => {
    try {
        const { orderId, amount, currency, artistId, productType, metadata } = req.body;

        if (!orderId || !amount) {
            return res.status(400).json({ message: 'orderId and amount are required' });
        }

        const platformFeeRate = 0.10;
        const platformFee = Math.round(amount * platformFeeRate * 100) / 100;

        await EventsLedger.create({
            actorId: req.user._id,
            actorType: 'user',
            eventType: 'gmv_order',
            amount,
            currency: currency || 'USD',
            metadata: { orderId, artistId, productType, ...metadata }
        });

        await EventsLedger.create({
            actorId: req.user._id,
            actorType: 'system',
            eventType: 'platform_fee_recorded',
            amount: platformFee,
            currency: currency || 'USD',
            metadata: { orderId, feeRate: platformFeeRate }
        });

        res.json({ message: 'GMV event recorded', platformFee });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
module.exports.PLAN_TOKEN_GRANTS = PLAN_TOKEN_GRANTS;
module.exports.grantTokensForPlan = grantTokensForPlan;
