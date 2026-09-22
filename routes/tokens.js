const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const TokenLedger = require('../models/TokenLedger');
const EventsLedger = require('../models/EventsLedger');

const TOKEN_PACKS = [
    { id: 'pack_25', tokens: 25, price: 1.99, appleProductId: 'com.wordeth.app.tokens.25' },
    { id: 'pack_50', tokens: 50, price: 3.49, appleProductId: 'com.wordeth.app.tokens.50' },
    { id: 'pack_100', tokens: 100, price: 5.99, appleProductId: 'com.wordeth.app.tokens.100' }
];

/** What the App Store sells, keyed by the product id the phone reports. */
const APPLE_PRODUCTS = new Map(TOKEN_PACKS.map((p) => [p.appleProductId, p]));

const TOKEN_CASHOUT_RATE = 0.03;

router.get('/balance', auth, async (req, res) => {
    try {
        const user = req.user;
        const response = {
            tokenBalance: user.tokenBalance || 0
        };
        const creatorTypes = ['artist', 'designer', 'label'];
        if (creatorTypes.includes(user.accountType)) {
            response.tokenEarnings = user.tokenEarnings || 0;
            response.earningsValue = Math.round((user.tokenEarnings || 0) * TOKEN_CASHOUT_RATE * 100) / 100;
        }
        res.json(response);
    } catch (error) {
        console.error('Error fetching token balance:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/grant', auth, require('../middleware/limits').grant, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { userId, reason } = req.body;
        const amount = Number(req.body.amount);
        if (!userId || !Number.isInteger(amount) || amount <= 0 || amount > 100000) {
            return res.status(400).json({ message: 'userId and a whole amount between 1 and 100000 are required' });
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const balanceBefore = targetUser.tokenBalance || 0;
        targetUser.tokenBalance = balanceBefore + amount;
        await targetUser.save();

        await TokenLedger.create({
            userId: targetUser._id,
            type: 'monthly_grant',
            amount: amount,
            balanceBefore,
            balanceAfter: targetUser.tokenBalance,
            metadata: { reason: reason || 'monthly_grant', grantedBy: req.user._id }
        });
        require('../services/realtime').emitToUser(targetUser._id, 'token-balance', { balance: targetUser.tokenBalance, delta: amount, reason: 'grant' });

        await EventsLedger.create({
            actorId: req.user._id,
            actorType: 'admin',
            eventType: 'token_grant',
            resourceType: 'user',
            resourceId: targetUser._id,
            amount,
            description: `Granted ${amount} tokens to user ${targetUser.name}`,
            metadata: { reason: reason || 'monthly_grant', targetUserId: targetUser._id.toString() }
        });

        res.json({
            message: 'Tokens granted successfully',
            userId: targetUser._id,
            amount,
            newBalance: targetUser.tokenBalance
        });
    } catch (error) {
        console.error('Error granting tokens:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * The catalogue, so a client can show prices without hard-coding them.
 */
router.get('/packs', (req, res) => {
    res.json({ packs: TOKEN_PACKS.map((p) => ({ id: p.id, tokens: p.tokens, price: p.price, appleProductId: p.appleProductId })) });
});

/**
 * Credit a pack bought through Apple's in-app purchase.
 *
 * The phone sends the signed transaction StoreKit gave it. The signature is
 * checked against Apple's root certificates before anything is credited, and
 * the transaction id is written with a unique index, so replaying the same
 * purchase credits nothing the second time.
 */
router.post('/apple-purchase', auth, require('../middleware/limits').applePurchase, async (req, res) => {
    const { verifyTransaction } = require('../services/appleIap');
    const ApplePurchase = require('../models/ApplePurchase');
    try {
        let verified;
        try {
            verified = await verifyTransaction(req.body && req.body.transaction);
        } catch (e) {
            console.warn('[iap] verification failed:', e.code || e.message);
            return res.status(400).json({ message: e.message || 'That purchase could not be verified.', code: e.code || 'VERIFICATION_FAILED' });
        }
        const { payload, environment } = verified;
        const pack = APPLE_PRODUCTS.get(payload.productId);
        if (!pack) {
            return res.status(400).json({ message: 'That product is not a token pack.', code: 'UNKNOWN_PRODUCT' });
        }
        const transactionId = String(payload.transactionId);
        const quantity = Math.max(1, Math.min(10, Number(payload.quantity) || 1));
        const tokens = pack.tokens * quantity;

        // Claim the transaction first: the unique index makes a replay a no-op.
        try {
            await ApplePurchase.create({
                transactionId,
                originalTransactionId: payload.originalTransactionId ? String(payload.originalTransactionId) : null,
                userId: req.user._id,
                productId: payload.productId,
                quantity,
                tokens,
                environment
            });
        } catch (e) {
            if (e && e.code === 11000) {
                const user = await User.findById(req.user._id).select('tokenBalance');
                return res.json({ message: 'Already credited.', alreadyCredited: true, tokens: 0, newBalance: user ? user.tokenBalance || 0 : 0 });
            }
            throw e;
        }

        const user = await User.findById(req.user._id);
        const balanceBefore = user.tokenBalance || 0;
        user.tokenBalance = balanceBefore + tokens;
        await user.save();

        await TokenLedger.create({
            userId: user._id,
            type: 'pack_purchase',
            amount: tokens,
            balanceBefore,
            balanceAfter: user.tokenBalance,
            metadata: { packId: pack.id, price: pack.price * quantity, tokensReceived: tokens, source: 'apple', transactionId, environment }
        });
        await EventsLedger.create({
            actorId: user._id,
            actorType: 'user',
            eventType: 'token_pack_purchase',
            resourceType: 'token_pack',
            amount: pack.price * quantity,
            description: `Purchased ${tokens} tokens via Apple`,
            metadata: { packId: pack.id, tokens, price: pack.price * quantity, source: 'apple', environment }
        });

        try {
            require('../services/realtime').emitToUser(user._id, 'token-balance', { balance: user.tokenBalance, delta: tokens, reason: 'purchase' });
        } catch { /* the balance still returns below */ }

        res.json({ message: 'Tokens added.', tokens, newBalance: user.tokenBalance });
    } catch (error) {
        console.error('Error crediting Apple purchase:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * Legacy: credited a pack with no payment at all. Admin-only now; the web
 * buys through Stripe and the app through Apple.
 */
router.post('/purchase-pack', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Token packs are bought in the app or on the website.', code: 'USE_STORE' });
        }
        const { packId } = req.body;
        const pack = TOKEN_PACKS.find(p => p.id === packId);
        if (!pack) {
            return res.status(400).json({ message: 'Invalid pack. Available packs: ' + TOKEN_PACKS.map(p => p.id).join(', ') });
        }

        const user = await User.findById(req.user._id);
        const balanceBefore = user.tokenBalance || 0;
        user.tokenBalance = balanceBefore + pack.tokens;
        await user.save();

        await TokenLedger.create({
            userId: user._id,
            type: 'pack_purchase',
            amount: pack.tokens,
            balanceBefore,
            balanceAfter: user.tokenBalance,
            metadata: { packId: pack.id, price: pack.price, tokensReceived: pack.tokens }
        });

        await EventsLedger.create({
            actorId: user._id,
            actorType: 'user',
            eventType: 'token_pack_purchase',
            resourceType: 'token_pack',
            amount: pack.price,
            description: `Purchased ${pack.tokens} tokens for $${pack.price}`,
            metadata: { packId: pack.id, tokens: pack.tokens, price: pack.price }
        });

        res.json({
            message: 'Token pack purchased successfully',
            pack: { id: pack.id, tokens: pack.tokens, price: pack.price },
            newBalance: user.tokenBalance
        });
    } catch (error) {
        console.error('Error purchasing token pack:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/history', auth, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const filter = { userId: req.user._id };
        if (req.query.type) {
            filter.type = req.query.type;
        }

        const [transactions, total] = await Promise.all([
            TokenLedger.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            TokenLedger.countDocuments(filter)
        ]);

        res.json({
            transactions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching token history:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/payout', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { creatorId } = req.body;

        let creators;
        if (creatorId) {
            const creator = await User.findById(creatorId);
            if (!creator) {
                return res.status(404).json({ message: 'Creator not found' });
            }
            creators = [creator];
        } else {
            creators = await User.find({
                tokenEarnings: { $gt: 0 },
                accountType: { $in: ['artist', 'designer', 'label'] }
            });
        }

        const payouts = [];
        for (const creator of creators) {
            if ((creator.tokenEarnings || 0) <= 0) continue;

            const tokensToPayOut = creator.tokenEarnings;
            const payoutAmount = Math.round(tokensToPayOut * TOKEN_CASHOUT_RATE * 100) / 100;

            const balanceBefore = creator.tokenEarnings;
            creator.tokenEarnings = 0;
            await creator.save();

            await TokenLedger.create({
                userId: creator._id,
                type: 'creator_payout',
                amount: -tokensToPayOut,
                balanceBefore,
                balanceAfter: 0,
                metadata: { payoutAmount, rate: TOKEN_CASHOUT_RATE, tokens: tokensToPayOut }
            });

            await EventsLedger.create({
                actorId: req.user._id,
                actorType: 'admin',
                eventType: 'token_payout',
                resourceType: 'user',
                resourceId: creator._id,
                amount: payoutAmount,
                description: `Payout ${tokensToPayOut} tokens ($${payoutAmount}) to creator ${creator.name}`,
                metadata: {
                    creatorId: creator._id.toString(),
                    tokens: tokensToPayOut,
                    payoutAmount,
                    rate: TOKEN_CASHOUT_RATE
                }
            });

            payouts.push({
                creatorId: creator._id,
                creatorName: creator.name,
                tokens: tokensToPayOut,
                payoutAmount
            });
        }

        res.json({
            message: `Processed ${payouts.length} creator payout(s)`,
            payouts
        });
    } catch (error) {
        console.error('Error processing payouts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/packs', (req, res) => {
    res.json({ packs: TOKEN_PACKS });
});

module.exports = router;
