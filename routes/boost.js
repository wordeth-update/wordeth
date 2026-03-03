const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Replay = require('../models/Replay');
const TokenLedger = require('../models/TokenLedger');
const EventsLedger = require('../models/EventsLedger');

const BOOST_TIERS = {
    small: { cost: 100, durationHours: 24 },
    medium: { cost: 250, durationHours: 72 },
    featured: { cost: 500, durationHours: 168 }
};

router.post('/', auth, async (req, res) => {
    try {
        const { replayId, tier } = req.body;

        if (!replayId || !tier) {
            return res.status(400).json({ message: 'replayId and tier are required' });
        }

        const tierConfig = BOOST_TIERS[tier];
        if (!tierConfig) {
            return res.status(400).json({ message: 'Invalid tier. Must be: small, medium, or featured' });
        }

        const replay = await Replay.findById(replayId);
        if (!replay) {
            return res.status(404).json({ message: 'Replay not found' });
        }

        if (replay.creatorUserId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only the replay creator can boost it' });
        }

        if (replay.status === 'removed') {
            return res.status(400).json({ message: 'Cannot boost a removed replay' });
        }

        const user = await User.findById(req.user._id);
        if ((user.tokenBalance || 0) < tierConfig.cost) {
            return res.status(400).json({
                message: 'Insufficient token balance',
                required: tierConfig.cost,
                current: user.tokenBalance || 0
            });
        }

        const balanceBefore = user.tokenBalance;
        user.tokenBalance = balanceBefore - tierConfig.cost;
        await user.save();

        const now = new Date();
        replay.boostedUntil = new Date(now.getTime() + tierConfig.durationHours * 60 * 60 * 1000);
        replay.boostTier = tier;
        await replay.save();

        await TokenLedger.create({
            userId: user._id,
            type: 'boost_purchase',
            amount: -tierConfig.cost,
            balanceBefore,
            balanceAfter: user.tokenBalance,
            metadata: {
                replayId: replay._id.toString(),
                tier,
                durationHours: tierConfig.durationHours,
                cost: tierConfig.cost
            }
        });

        await EventsLedger.create({
            actorId: user._id,
            actorType: 'user',
            eventType: 'token_boost',
            resourceType: 'replay',
            resourceId: replay._id,
            amount: tierConfig.cost,
            description: `Boosted replay "${replay.title}" with ${tier} tier (${tierConfig.cost} tokens, ${tierConfig.durationHours}h)`,
            metadata: {
                replayId: replay._id.toString(),
                tier,
                durationHours: tierConfig.durationHours,
                cost: tierConfig.cost,
                boostedUntil: replay.boostedUntil.toISOString()
            }
        });

        res.json({
            message: 'Replay boosted successfully',
            replayId: replay._id,
            tier,
            boostedUntil: replay.boostedUntil,
            tokensDeducted: tierConfig.cost,
            newBalance: user.tokenBalance
        });
    } catch (error) {
        console.error('Error boosting replay:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/active', async (req, res) => {
    try {
        const now = new Date();
        const boostedReplays = await Replay.find({
            status: { $in: ['available', 'processing'] },
            boostedUntil: { $gt: now },
            boostTier: { $ne: 'none' }
        })
        .populate('creatorUserId', 'name avatar creatorProfile')
        .sort({ boostTier: -1, boostedUntil: -1 })
        .lean();

        const tierOrder = { featured: 0, medium: 1, small: 2 };
        boostedReplays.sort((a, b) => {
            const aTier = tierOrder[a.boostTier] ?? 3;
            const bTier = tierOrder[b.boostTier] ?? 3;
            if (aTier !== bTier) return aTier - bTier;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        res.json({ boostedReplays });
    } catch (error) {
        console.error('Error fetching boosted replays:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
