const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const EventsLedger = require('../models/EventsLedger');
const auth = require('../middleware/auth');
const { requireAccountType } = require('../middleware/rbac');
const { getUserEntitlements, checkGraduation } = require('../services/entitlements');

function generateHandle(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 30);
}

router.post('/register', [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('accountType').isIn(['artist', 'designer']).withMessage('Account type must be artist or designer'),
    body('displayName').trim().isLength({ min: 2 }).withMessage('Display name is required'),
    body('genres').optional().isArray()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, password, accountType, displayName, genres, agreedToTerms } = req.body;

        if (!agreedToTerms) {
            return res.status(400).json({ message: 'You must agree to the Terms of Service and Privacy Policy.' });
        }

        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: 'An account with this email already exists' });
        }

        const existingName = await User.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
        if (existingName) {
            return res.status(400).json({ message: 'That username is already taken.' });
        }

        let handle = generateHandle(displayName);
        const existingHandle = await User.findOne({ 'creatorProfile.handle': handle });
        if (existingHandle) {
            handle = `${handle}-${Date.now().toString(36).slice(-4)}`;
        }

        const roleMap = { artist: 'ARTIST', designer: 'DESIGNER' };

        const freePlanSlug = `${accountType}-free`;
        let plan = await Plan.findOne({ slug: freePlanSlug, active: true });

        if (!plan) {
            const starterSlug = `${accountType}-starter`;
            plan = await Plan.findOne({ slug: starterSlug, active: true });
        }

        const user = new User({
            name,
            email,
            password,
            role: roleMap[accountType] || 'USER_FAN',
            accountType,
            creatorProfile: {
                displayName,
                handle,
                genres: genres || [],
                firstActiveAt: new Date()
            },
            agreedToTerms: true,
            termsAgreedAt: new Date(),
            termsVersion: '1.0'
        });

        if (plan) {
            const subscription = new Subscription({
                userId: user._id,
                planId: plan._id,
                status: 'active',
                billingCycle: 'free',
                currentPeriodStart: new Date()
            });
            await subscription.save();
            user.subscriptionId = subscription._id;
        }

        await user.save();

        await EventsLedger.create({
            actorId: user._id,
            actorType: 'user',
            eventType: 'account_created',
            metadata: { accountType, handle, displayName }
        });

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        });

        res.status(201).json({
            token,
            user: user.getPublicProfile(),
            accountType,
            handle
        });
    } catch (error) {
        console.error('Creator registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/dashboard', auth, requireAccountType('artist', 'designer'), async (req, res) => {
    try {
        const entitlements = await getUserEntitlements(req.user);
        const graduation = checkGraduation(req.user);

        let subscription = null;
        let plan = null;
        if (req.user.subscriptionId) {
            subscription = await Subscription.findById(req.user.subscriptionId);
            if (subscription) {
                plan = await Plan.findById(subscription.planId);
            }
        }

        if (!plan) {
            const freePlanSlug = `${req.user.accountType}-free`;
            plan = await Plan.findOne({ slug: freePlanSlug, active: true });
        }

        const availablePlans = await Plan.find({
            category: req.user.accountType,
            active: true
        }).sort({ tier: 1 });

        res.json({
            profile: {
                displayName: req.user.creatorProfile?.displayName || req.user.name,
                handle: req.user.creatorProfile?.handle || '',
                genres: req.user.creatorProfile?.genres || [],
                socialLinks: req.user.creatorProfile?.socialLinks || {},
                avatar: req.user.avatar,
                storageUsedBytes: req.user.creatorProfile?.storageUsedBytes || 0,
                templateCount: req.user.creatorProfile?.templateCount || 0,
                totalEarnings: req.user.creatorProfile?.totalEarnings || 0,
                totalSales: req.user.creatorProfile?.totalSales || 0,
                monthsActive: req.user.creatorProfile?.monthsActive || 0
            },
            currentPlan: plan ? {
                name: plan.name,
                slug: plan.slug,
                tier: plan.tier,
                priceMonthly: plan.priceMonthly,
                priceYearly: plan.priceYearly,
                features: plan.features
            } : null,
            subscription: subscription ? {
                status: subscription.status,
                billingCycle: subscription.billingCycle,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                isActive: subscription.isActive()
            } : null,
            entitlements,
            graduation,
            accountType: req.user.accountType,
            availablePlans: availablePlans.map(p => ({
                name: p.name,
                slug: p.slug,
                tier: p.tier,
                priceMonthly: p.priceMonthly,
                priceYearly: p.priceYearly,
                features: p.features,
                isCurrent: plan && plan._id.equals(p._id)
            }))
        });
    } catch (error) {
        console.error('Creator dashboard error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/profile', auth, requireAccountType('artist', 'designer'), [
    body('displayName').optional().trim().isLength({ min: 2 }),
    body('genres').optional().isArray(),
    body('bio').optional().trim()
], async (req, res) => {
    try {
        const { displayName, genres, bio, socialLinks } = req.body;

        if (displayName) req.user.creatorProfile.displayName = displayName;
        if (genres) req.user.creatorProfile.genres = genres;
        if (bio !== undefined) req.user.bio = bio;
        if (socialLinks) {
            const allowed = ['instagram', 'twitter', 'spotify', 'youtube', 'website'];
            for (const key of allowed) {
                if (socialLinks[key] !== undefined) {
                    req.user.creatorProfile.socialLinks[key] = socialLinks[key];
                }
            }
        }

        await req.user.save();
        res.json({ message: 'Profile updated', profile: req.user.creatorProfile });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/upgrade-account', auth, async (req, res) => {
    try {
        const { accountType } = req.body;
        if (!['artist', 'designer'].includes(accountType)) {
            return res.status(400).json({ message: 'Invalid account type' });
        }

        if (req.user.accountType === accountType) {
            return res.status(400).json({ message: `Already registered as ${accountType}` });
        }

        const roleMap = { artist: 'ARTIST', designer: 'DESIGNER' };
        req.user.accountType = accountType;
        req.user.role = roleMap[accountType];

        if (!req.user.creatorProfile.handle) {
            req.user.creatorProfile.handle = generateHandle(req.user.name);
            req.user.creatorProfile.displayName = req.user.name;
            req.user.creatorProfile.firstActiveAt = new Date();
        }

        const freePlanSlug = `${accountType}-free`;
        let plan = await Plan.findOne({ slug: freePlanSlug, active: true });
        if (!plan) {
            plan = await Plan.findOne({ slug: `${accountType}-starter`, active: true });
        }

        if (plan) {
            if (req.user.subscriptionId) {
                const oldSub = await Subscription.findById(req.user.subscriptionId);
                if (oldSub) {
                    oldSub.status = 'canceled';
                    await oldSub.save();
                }
            }
            const subscription = new Subscription({
                userId: req.user._id,
                planId: plan._id,
                status: 'active',
                billingCycle: 'free',
                currentPeriodStart: new Date()
            });
            await subscription.save();
            req.user.subscriptionId = subscription._id;
        }

        await req.user.save();

        await EventsLedger.create({
            actorId: req.user._id,
            actorType: 'user',
            eventType: 'account_type_changed',
            metadata: { newAccountType: accountType }
        });

        res.json({
            message: `Account upgraded to ${accountType}`,
            accountType: req.user.accountType,
            role: req.user.role
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

const { recordSale, getSellerPayoutRate, getPayoutSummary } = require('../services/payoutService');
const MerchSale = require('../models/MerchSale');

router.get('/payout-info', auth, requireAccountType('artist', 'designer'), async (req, res) => {
    try {
        const user = req.user;
        const sellerType = user.accountType;
        const { payoutRate } = await getSellerPayoutRate(sellerType, user._id);
        const summary = await getPayoutSummary(sellerType, user._id);

        res.json({
            success: true,
            data: {
                payoutRate,
                payoutPercentage: (payoutRate * 100).toFixed(1),
                platformFeePercentage: ((1 - payoutRate) * 100).toFixed(1),
                ...summary
            }
        });
    } catch (error) {
        console.error('Creator payout info error:', error);
        res.status(500).json({ success: false, message: 'Failed to load payout info' });
    }
});

router.post('/record-sale', auth, requireAccountType('artist', 'designer'), [
    body('orderId').trim().notEmpty().withMessage('Order ID is required'),
    body('sku').trim().notEmpty().withMessage('SKU is required'),
    body('productName').trim().notEmpty().withMessage('Product name is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('totalAmount').isFloat({ min: 0 }).withMessage('Total amount must be >= 0')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const user = req.user;
        const displayName = user.creatorProfile?.displayName || user.name;
        const handle = user.creatorProfile?.handle || user.name.toLowerCase().replace(/\s+/g, '-');

        const result = await recordSale({
            orderId: req.body.orderId,
            sellerType: user.accountType,
            sellerId: user._id,
            artistName: displayName,
            artistSlug: handle,
            sku: req.body.sku,
            productName: req.body.productName,
            productType: req.body.productType || 'other',
            songTitle: req.body.songTitle || '',
            albumTitle: req.body.albumTitle || '',
            lyricsSnippet: req.body.lyricsSnippet || '',
            quantity: parseInt(req.body.quantity),
            unitPrice: parseFloat(req.body.unitPrice) || 0,
            totalAmount: parseFloat(req.body.totalAmount),
            currency: req.body.currency || 'USD',
            geo: req.body.geo || {},
            saleDate: req.body.saleDate
        }, 'api');

        if (result.duplicate) {
            return res.status(409).json({
                success: false,
                message: 'This sale has already been recorded (duplicate order ID + SKU)'
            });
        }

        res.json({
            success: true,
            message: 'Sale recorded successfully',
            data: {
                saleId: result.sale._id,
                totalAmount: result.sale.totalAmount,
                payoutAmount: result.sale.payoutAmount,
                platformFeeAmount: result.sale.platformFeeAmount,
                payoutRate: result.sale.payoutRate
            }
        });
    } catch (error) {
        console.error('Record sale error:', error);
        res.status(500).json({ success: false, message: 'Failed to record sale' });
    }
});

router.get('/sales', auth, requireAccountType('artist', 'designer'), async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        const match = { sellerType: req.user.accountType, sellerId: req.user._id };

        if (startDate || endDate) {
            match.saleDate = {};
            if (startDate) match.saleDate.$gte = new Date(startDate);
            if (endDate) match.saleDate.$lte = new Date(endDate);
        }

        const sales = await MerchSale.find(match)
            .sort({ saleDate: -1 })
            .limit(parseInt(limit) || 50)
            .select('orderId sku productName productType quantity totalAmount payoutAmount platformFeeAmount payoutRate saleDate status source');

        res.json({ success: true, data: sales });
    } catch (error) {
        console.error('Sales list error:', error);
        res.status(500).json({ success: false, message: 'Failed to load sales' });
    }
});

router.get('/ledger', auth, requireAccountType('artist', 'designer'), async (req, res) => {
    try {
        const { limit } = req.query;

        const entries = await EventsLedger.find({
            actorId: req.user._id,
            eventType: { $in: ['gmv_order', 'platform_fee_recorded'] }
        })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit) || 50);

        res.json({ success: true, data: entries });
    } catch (error) {
        console.error('Creator ledger error:', error);
        res.status(500).json({ success: false, message: 'Failed to load ledger' });
    }
});

module.exports = router;
