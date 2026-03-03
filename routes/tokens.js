const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const TokenLedger = require('../models/TokenLedger');
const EventsLedger = require('../models/EventsLedger');

const TOKEN_PACKS = [
    { id: 'pack_25', tokens: 25, price: 1.99 },
    { id: 'pack_50', tokens: 50, price: 3.49 },
    { id: 'pack_100', tokens: 100, price: 5.99 }
];

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

router.post('/grant', auth, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const { userId, amount, reason } = req.body;
        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ message: 'userId and positive amount are required' });
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

router.post('/purchase-pack', auth, async (req, res) => {
    try {
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
