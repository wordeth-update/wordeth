const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Replay = require('../models/Replay');
const User = require('../models/User');
const TokenLedger = require('../models/TokenLedger');
const EventsLedger = require('../models/EventsLedger');

router.post('/', auth, async (req, res) => {
    try {
        const creatorTypes = ['artist', 'designer', 'creator', 'label'];
        if (!creatorTypes.includes(req.user.accountType)) {
            return res.status(403).json({ message: 'Only creators can save replays' });
        }

        const { title, genre, tokenPrice, duration, participantCount, participantHistory, roomId, description, tags } = req.body;

        if (!title || !roomId) {
            return res.status(400).json({ message: 'title and roomId are required' });
        }

        const replay = await Replay.create({
            roomId,
            creatorUserId: req.user._id,
            title: title.trim(),
            description: (description || '').trim(),
            genre: genre || '',
            duration: Math.max(0, parseInt(duration) || 0),
            participantCount: Math.max(0, parseInt(participantCount) || 0),
            tokenPrice: Math.max(0, parseInt(tokenPrice) || 0),
            participantHistory: participantHistory || [],
            tags: tags || [],
            status: 'available'
        });

        res.status(201).json(replay);
    } catch (error) {
        console.error('Error creating replay:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const filter = { status: 'available' };

        if (req.query.genre) {
            filter.genre = req.query.genre;
        }
        if (req.query.creator) {
            filter.creatorUserId = req.query.creator;
        }

        let sortOption = { createdAt: -1 };
        switch (req.query.sort) {
            case 'rating':
                sortOption = { 'rating.average': -1, 'rating.count': -1 };
                break;
            case 'plays':
                sortOption = { totalPlays: -1 };
                break;
            case 'price_asc':
            case 'price-low':
                sortOption = { tokenPrice: 1 };
                break;
            case 'recent':
            default:
                sortOption = { createdAt: -1 };
                break;
        }

        const now = new Date();

        const [boosted, regular, totalCount] = await Promise.all([
            Replay.find({ ...filter, boostedUntil: { $gt: now }, boostTier: { $ne: 'none' } })
                .populate('creatorUserId', 'name avatar creatorProfile accountType creatorRating')
                .sort({ boostTier: -1, boostedUntil: -1 })
                .lean(),
            Replay.find({ ...filter, $or: [{ boostedUntil: null }, { boostedUntil: { $lte: now } }, { boostTier: 'none' }] })
                .populate('creatorUserId', 'name avatar creatorProfile accountType creatorRating')
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean(),
            Replay.countDocuments(filter)
        ]);

        const replays = page === 1 ? [...boosted, ...regular] : regular;

        res.json({
            replays,
            hasMore: page * limit < totalCount,
            pagination: {
                page,
                limit,
                total: totalCount,
                pages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching replays:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/creator/:userId', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const filter = { creatorUserId: req.params.userId, status: { $ne: 'removed' } };

        const [replays, total] = await Promise.all([
            Replay.find(filter)
                .populate('creatorUserId', 'name avatar creatorProfile accountType')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Replay.countDocuments(filter)
        ]);

        res.json({
            replays,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Error fetching creator replays:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const replay = await Replay.findById(req.params.id)
            .populate('creatorUserId', 'name avatar creatorProfile accountType')
            .lean();

        if (!replay || replay.status === 'removed') {
            return res.status(404).json({ message: 'Replay not found' });
        }

        res.json(replay);
    } catch (error) {
        console.error('Error fetching replay:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/:id/play', auth, async (req, res) => {
    try {
        const replay = await Replay.findById(req.params.id);
        if (!replay || replay.status !== 'available') {
            return res.status(404).json({ message: 'Replay not found or unavailable' });
        }

        const price = replay.tokenPrice || 0;
        let userBalance;

        if (price > 0) {
            const deductResult = await User.findOneAndUpdate(
                { _id: req.user._id, tokenBalance: { $gte: price } },
                { $inc: { tokenBalance: -price } },
                { new: true }
            );

            if (!deductResult) {
                const checkUser = await User.findById(req.user._id);
                return res.status(402).json({ message: 'Insufficient token balance', required: price, balance: checkUser ? (checkUser.tokenBalance || 0) : 0 });
            }

            userBalance = deductResult.tokenBalance;
            const balanceBefore = userBalance + price;

            await TokenLedger.create({
                userId: deductResult._id,
                type: 'replay_play',
                amount: -price,
                balanceBefore: balanceBefore,
                balanceAfter: userBalance,
                relatedUserId: replay.creatorUserId,
                roomId: replay.roomId,
                metadata: { replayId: replay._id.toString(), replayTitle: replay.title }
            });

            const creatorUpdate = await User.findOneAndUpdate(
                { _id: replay.creatorUserId },
                { $inc: { tokenEarnings: price } },
                { new: true }
            );

            if (creatorUpdate) {
                await TokenLedger.create({
                    userId: creatorUpdate._id,
                    type: 'room_earning',
                    amount: price,
                    balanceBefore: creatorUpdate.tokenEarnings - price,
                    balanceAfter: creatorUpdate.tokenEarnings,
                    relatedUserId: deductResult._id,
                    roomId: replay.roomId,
                    metadata: { replayId: replay._id.toString(), replayTitle: replay.title, source: 'replay_play' }
                });
            }

            await EventsLedger.create({
                actorId: deductResult._id,
                actorType: 'user',
                eventType: 'token_replay_play',
                resourceType: 'replay',
                resourceId: replay._id,
                amount: price,
                description: `Played replay "${replay.title}" for ${price} tokens`,
                metadata: { replayId: replay._id.toString(), creatorId: replay.creatorUserId.toString(), price }
            });
        }

        replay.totalPlays = (replay.totalPlays || 0) + 1;
        replay.totalEarnings = (replay.totalEarnings || 0) + price;
        await replay.save();

        res.json({
            message: 'Replay play recorded',
            replay: {
                _id: replay._id,
                title: replay.title,
                totalPlays: replay.totalPlays,
                tokenPrice: replay.tokenPrice
            },
            newBalance: price > 0 ? userBalance : undefined
        });
    } catch (error) {
        console.error('Error playing replay:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.patch('/:id', auth, async (req, res) => {
    try {
        const replay = await Replay.findById(req.params.id);
        if (!replay) {
            return res.status(404).json({ message: 'Replay not found' });
        }

        if (replay.creatorUserId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only the creator can update this replay' });
        }

        const allowedFields = ['title', 'description', 'tokenPrice', 'status', 'tags'];
        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                if (field === 'tokenPrice') {
                    updates[field] = Math.max(0, parseInt(req.body[field]) || 0);
                } else if (field === 'status') {
                    if (!['available', 'hidden'].includes(req.body[field])) {
                        return res.status(400).json({ message: 'Status must be "available" or "hidden"' });
                    }
                    updates[field] = req.body[field];
                } else {
                    updates[field] = req.body[field];
                }
            }
        }

        Object.assign(replay, updates);
        await replay.save();

        res.json(replay);
    } catch (error) {
        console.error('Error updating replay:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const replay = await Replay.findById(req.params.id);
        if (!replay) {
            return res.status(404).json({ message: 'Replay not found' });
        }

        if (replay.creatorUserId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only the creator can delete this replay' });
        }

        replay.status = 'removed';
        await replay.save();

        res.json({ message: 'Replay removed successfully' });
    } catch (error) {
        console.error('Error deleting replay:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
