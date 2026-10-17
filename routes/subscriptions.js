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
const { getStripeClient } = require('../services/stripeClient');

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
    'label-enterprise': 200,
    'creator-starter': 50,
    'creator-growth': 100,
    'creator-pro': 135
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
    res.status(410).json({
        message: 'Subscriptions must be activated through secure checkout.',
        checkoutEndpoint: '/api/stripe/create-checkout-session'
    });
});

/**
 * User+ bought through Apple.
 *
 * The phone sends the signed transaction StoreKit gave it for the
 * subscription. Apple's signature is checked, and the subscription record
 * follows the transaction: its period end is Apple's expiry date, and each
 * new transaction id (first purchase, then each renewal) adds the plan's
 * tokens once. The phone sends the latest transaction again whenever it
 * opens, which is how renewals reach us without a callback from Apple.
 */
const APPLE_USER_PLUS = {
    'com.wordeth.app.userplus.monthly': 'monthly',
    'com.wordeth.app.userplus.yearly': 'yearly'
};
router.post('/apple', auth, async (req, res) => {
    try {
        const { verifyTransaction } = require('../services/appleIap');
        const ApplePurchase = require('../models/ApplePurchase');
        let verified;
        try {
            verified = await verifyTransaction(req.body && req.body.transaction);
        } catch (e) {
            return res.status(400).json({ message: e.message || 'That purchase could not be verified.', code: e.code || 'VERIFICATION_FAILED' });
        }
        const { payload, environment } = verified;
        const cycle = APPLE_USER_PLUS[payload.productId];
        if (!cycle) return res.status(400).json({ message: 'That product is not a Wordeth plan.', code: 'UNKNOWN_PRODUCT' });
        const plan = await Plan.findOne({ slug: 'fan-plus', active: true });
        if (!plan) return res.status(500).json({ message: 'The plan is not set up.' });

        const original = String(payload.originalTransactionId || payload.transactionId);
        const expiresAt = payload.expiresDate ? new Date(Number(payload.expiresDate)) : null;
        const startedAt = payload.purchaseDate ? new Date(Number(payload.purchaseDate)) : new Date();
        const revoked = !!payload.revocationDate;
        const live = !!expiresAt && expiresAt.getTime() > Date.now() && !revoked;

        let sub = await Subscription.findOne({ appleOriginalTransactionId: original });
        if (!sub) sub = await Subscription.findOne({ userId: req.user._id, provider: 'apple' });
        if (sub && String(sub.userId) !== String(req.user._id)) {
            return res.status(409).json({ message: 'This subscription belongs to another Wordeth account.', code: 'OTHER_ACCOUNT' });
        }
        if (!sub) sub = new Subscription({ userId: req.user._id, planId: plan._id, provider: 'apple', appleOriginalTransactionId: original });
        sub.planId = plan._id;
        sub.billingCycle = cycle;
        sub.currentPeriodStart = startedAt;
        sub.currentPeriodEnd = expiresAt;
        sub.status = live ? 'active' : 'expired';
        sub.cancelAtPeriodEnd = false;
        sub.appleOriginalTransactionId = original;
        sub.metadata = { ...(sub.metadata || {}), environment, productId: payload.productId };
        await sub.save();

        const user = await User.findById(req.user._id);
        if (user && String(user.subscriptionId || '') !== String(sub._id)) {
            user.subscriptionId = sub._id;
            await user.save();
        }

        // Each transaction id once: the first purchase and every renewal bring the plan's tokens.
        let granted = 0;
        if (live) {
            const transactionId = String(payload.transactionId);
            const already = await ApplePurchase.findOne({ transactionId }).select('_id');
            if (!already) {
                try {
                    await ApplePurchase.create({
                        transactionId, originalTransactionId: original, userId: req.user._id,
                        productId: payload.productId, tokens: PLAN_TOKEN_GRANTS['fan-plus'] || 0, environment
                    });
                    await grantTokensForPlan(user, 'fan-plus');
                    granted = PLAN_TOKEN_GRANTS['fan-plus'] || 0;
                } catch (e) {
                    if (!(e && e.code === 11000)) throw e;
                }
            }
        }
        const { getUserAccess } = require('../services/userAccess');
        res.json({ message: live ? 'User+ is on.' : 'This subscription has ended.', active: live, periodEnd: expiresAt, tokensGranted: granted, access: await getUserAccess(req.user._id) });
    } catch (error) {
        console.error('[Subscriptions] apple:', error);
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
        if (subscription.provider === 'apple') {
            return res.status(400).json({ message: 'This plan is billed by Apple. Cancel it in your iPhone Settings → Apple Account → Subscriptions.', code: 'APPLE_MANAGED' });
        }

        // The pricing page promises that cancelling stops the next charge and
        // keeps the plan until the period ends. Stripe is who charges, so
        // Stripe has to be told: marking our own record alone left the card
        // on file renewing a plan its owner believed they had cancelled.
        if (subscription.stripeSubscriptionId) {
            try {
                // Throws when billing is not configured, which is also a reason not to claim it worked.
                const stripe = getStripeClient();
                await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
            } catch (stripeErr) {
                // Already gone at Stripe is the outcome that was asked for.
                if (stripeErr?.code !== 'resource_missing') {
                    console.error('[Subscriptions] Stripe would not cancel:', stripeErr.message);
                    return res.status(502).json({ message: 'Billing could not confirm the cancellation. Nothing was changed; please try again shortly.' });
                }
            }
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
