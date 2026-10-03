'use strict';

/**
 * Pounds: a person opting in to talk with a retailer, for a while.
 * The model (models/Pound.js) says what one is. This is how one starts,
 * how either side ends it, and how the app asks where things stand.
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const limits = require('../middleware/limits');
const Pound = require('../models/Pound');
const Ad = require('../models/Ad');
const Advertiser = require('../models/Advertiser');
const User = require('../models/User');
const { avatarRef } = require('../services/avatarRef');

function tell(userId, event, payload) {
    const sockets = global._connectedUsers && global._connectedUsers.get(String(userId));
    if (!global._io || !sockets) return;
    for (const sid of sockets) global._io.to(sid).emit(event, payload);
}

async function view(pound, meId) {
    const iAmUser = String(pound.userId) === String(meId);
    const otherId = iAmUser ? pound.retailerUserId : pound.userId;
    const [other, advertiser] = await Promise.all([
        User.findById(otherId).select('name avatar').lean(),
        Advertiser.findById(pound.advertiserId).select('companyName').lean()
    ]);
    return {
        _id: String(pound._id),
        role: iAmUser ? 'user' : 'retailer',
        withUserId: String(otherId),
        withName: other?.name || (iAmUser ? advertiser?.companyName : 'Someone') || 'Someone',
        withAvatar: avatarRef(otherId, other?.avatar),
        company: advertiser?.companyName || '',
        startedAt: pound.startedAt,
        expiresAt: pound.expiresAt
    };
}

/**
 * POST /api/pounds { adId }
 * The opt-in. Only ever started by the person, only from an ad that offers
 * a chat. Pounding the same retailer again renews the clock.
 */
router.post('/', auth, limits.messages, async (req, res) => {
    try {
        const adId = String(req.body?.adId || '');
        if (!/^[a-f0-9]{24}$/i.test(adId)) return res.status(400).json({ message: 'That ad is not available.' });
        const ad = await Ad.findById(adId).select('advertiserId chatEnabled status');
        if (!ad || !ad.chatEnabled || ad.status !== 'active') return res.status(404).json({ message: 'That ad is not taking chats right now.' });
        const advertiser = await Advertiser.findById(ad.advertiserId).select('companyName chatUserId');
        if (!advertiser || !advertiser.chatUserId) return res.status(404).json({ message: 'That ad is not taking chats right now.' });
        if (String(advertiser.chatUserId) === String(req.user._id)) return res.status(400).json({ message: 'This is your own ad.' });
        if (req.user.retailerFor) return res.status(400).json({ message: 'A retailer account cannot pound another retailer.' });

        const expiresAt = new Date(Date.now() + Pound.HOURS * 60 * 60 * 1000);
        let pound = await Pound.between(req.user._id, advertiser.chatUserId);
        if (pound) {
            pound.expiresAt = expiresAt;
            await pound.save();
        } else {
            pound = await Pound.create({
                userId: req.user._id, advertiserId: advertiser._id, retailerUserId: advertiser.chatUserId,
                adId: ad._id, expiresAt
            });
            tell(advertiser.chatUserId, 'pound-started', { poundId: String(pound._id), userId: String(req.user._id), userName: req.user.name || 'Someone' });
        }
        res.status(201).json({ pound: await view(pound, req.user._id), hours: Pound.HOURS });
    } catch (error) {
        console.error('Pound error:', error);
        res.status(500).json({ message: 'Could not pound just now. Try again.' });
    }
});

/** GET /api/pounds — the live ones, whichever side of them you are on. */
router.get('/', auth, async (req, res) => {
    try {
        const pounds = await Pound.find({
            status: 'active', expiresAt: { $gt: new Date() },
            $or: [{ userId: req.user._id }, { retailerUserId: req.user._id }]
        }).sort({ expiresAt: 1 }).limit(100);
        res.json({ pounds: await Promise.all(pounds.map((p) => view(p, req.user._id))) });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * GET /api/pounds/with/:userId
 * Where things stand with one person: the live pound if there is one, and
 * whether this thread is a retailer thread at all (so the app knows to
 * close the composer when there is not).
 */
router.get('/with/:userId', auth, async (req, res) => {
    try {
        if (!/^[a-f0-9]{24}$/i.test(req.params.userId)) return res.json({ retailerThread: false, pound: null });
        const other = await User.findById(req.params.userId).select('retailerFor').lean();
        const retailerThread = !!(req.user.retailerFor || other?.retailerFor);
        const pound = retailerThread ? await Pound.between(req.user._id, req.params.userId) : null;
        res.json({ retailerThread, pound: pound ? await view(pound, req.user._id) : null });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

/** DELETE /api/pounds/:id — either side, any time, no reason needed. */
router.delete('/:id', auth, async (req, res) => {
    try {
        if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(404).json({ message: 'Not found' });
        const pound = await Pound.findById(req.params.id);
        const me = String(req.user._id);
        if (!pound || (String(pound.userId) !== me && String(pound.retailerUserId) !== me)) return res.status(404).json({ message: 'Not found' });
        if (pound.status === 'active') {
            const iAmUser = String(pound.userId) === me;
            pound.status = 'ended';
            pound.endedAt = new Date();
            pound.endedBy = iAmUser ? 'user' : 'retailer';
            await pound.save();
            tell(iAmUser ? pound.retailerUserId : pound.userId, 'pound-ended', { poundId: String(pound._id), byUserId: me });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
