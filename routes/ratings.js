const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const RoomRating = require('../models/RoomRating');
const Replay = require('../models/Replay');
const User = require('../models/User');

router.post('/', auth, async (req, res) => {
    try {
        const { roomId, replayId, rating, tags } = req.body;
        const userId = req.user._id;

        if (!roomId) {
            return res.status(400).json({ message: 'roomId is required' });
        }
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        const existing = await RoomRating.findOne({ roomId, userId });
        if (existing) {
            return res.status(409).json({ message: 'You have already rated this room' });
        }

        let creatorUserId = null;
        let replay = null;

        if (replayId) {
            replay = await Replay.findById(replayId);
            if (replay) {
                const attended = replay.participantHistory.some(
                    pid => pid.toString() === userId.toString()
                );
                if (!attended) {
                    return res.status(403).json({ message: 'You must have attended this room to rate it' });
                }
                creatorUserId = replay.creatorUserId;
            }
        }

        if (!creatorUserId) {
            const { getRoomById } = require('./signaling');
            const activeRoom = typeof getRoomById === 'function' ? getRoomById(roomId) : null;
            if (activeRoom && activeRoom.creatorUserId) {
                const attended = activeRoom.participantHistory && activeRoom.participantHistory.has
                    ? activeRoom.participantHistory.has(userId.toString())
                    : false;
                if (!attended) {
                    return res.status(403).json({ message: 'You must have attended this room to rate it' });
                }
                creatorUserId = activeRoom.creatorUserId;
            }
        }

        if (!creatorUserId) {
            const anyReplay = await Replay.findOne({ roomId });
            if (anyReplay) {
                const attended = anyReplay.participantHistory.some(
                    pid => pid.toString() === userId.toString()
                );
                if (!attended) {
                    return res.status(403).json({ message: 'You must have attended this room to rate it' });
                }
                creatorUserId = anyReplay.creatorUserId;
            }
        }

        if (!creatorUserId) {
            return res.status(400).json({ message: 'Could not determine room creator' });
        }

        const allowedTags = ['great-host', 'good-music', 'lively-chat', 'informative', 'entertaining', 'professional'];
        const filteredTags = (tags || []).filter(t => allowedTags.includes(t));

        const roomRating = new RoomRating({
            roomId,
            replayId: replayId || null,
            userId,
            creatorUserId,
            rating: Math.round(rating),
            tags: filteredTags
        });

        await roomRating.save();

        if (replay) {
            const agg = await RoomRating.aggregate([
                { $match: { roomId } },
                { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
            ]);
            if (agg.length > 0) {
                await Replay.findByIdAndUpdate(replayId, {
                    'rating.average': Math.round(agg[0].average * 10) / 10,
                    'rating.count': agg[0].count
                });
            }
        }

        const creatorAgg = await RoomRating.aggregate([
            { $match: { creatorUserId: creatorUserId } },
            { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);
        if (creatorAgg.length > 0) {
            await User.findByIdAndUpdate(creatorUserId, {
                'creatorRating.average': Math.round(creatorAgg[0].average * 10) / 10,
                'creatorRating.count': creatorAgg[0].count
            });
        }

        res.status(201).json({ message: 'Rating submitted', rating: roomRating });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: 'You have already rated this room' });
        }
        console.error('[Ratings] Error submitting rating:', error);
        res.status(500).json({ message: 'Failed to submit rating' });
    }
});

router.get('/creator/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const mongoose = require('mongoose');
        const creatorObjId = new mongoose.Types.ObjectId(userId);

        const agg = await RoomRating.aggregate([
            { $match: { creatorUserId: creatorObjId } },
            {
                $group: {
                    _id: null,
                    average: { $avg: '$rating' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const tagAgg = await RoomRating.aggregate([
            { $match: { creatorUserId: creatorObjId } },
            { $unwind: '$tags' },
            { $group: { _id: '$tags', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const tagFrequency = {};
        tagAgg.forEach(t => { tagFrequency[t._id] = t.count; });

        res.json({
            average: agg.length > 0 ? Math.round(agg[0].average * 10) / 10 : 0,
            count: agg.length > 0 ? agg[0].count : 0,
            tagFrequency
        });
    } catch (error) {
        console.error('[Ratings] Error getting creator ratings:', error);
        res.status(500).json({ message: 'Failed to get creator ratings' });
    }
});

router.get('/room/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const ratings = await RoomRating.find({ roomId })
            .populate('userId', 'name avatar')
            .sort({ createdAt: -1 })
            .limit(50);

        const agg = await RoomRating.aggregate([
            { $match: { roomId } },
            { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);

        res.json({
            ratings,
            average: agg.length > 0 ? Math.round(agg[0].average * 10) / 10 : 0,
            count: agg.length > 0 ? agg[0].count : 0
        });
    } catch (error) {
        console.error('[Ratings] Error getting room ratings:', error);
        res.status(500).json({ message: 'Failed to get room ratings' });
    }
});

router.get('/check/:roomId', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user._id;
        const existing = await RoomRating.findOne({ roomId, userId });
        res.json({ rated: !!existing, rating: existing || null });
    } catch (error) {
        console.error('[Ratings] Error checking rating:', error);
        res.status(500).json({ message: 'Failed to check rating' });
    }
});

module.exports = router;
