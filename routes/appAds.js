'use strict';

/**
 * Serving ads to the phone app. What the placements are and how one is
 * chosen is in services/appAds.js; this file is the door.
 *
 * Counting is the website's own: every ad handed out carries a ticket, and
 * the app gives it back to POST /api/ads/impression/:adId and
 * /api/ads/click/:adId. Nothing here can be counted without one.
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const auth = require('../middleware/auth');
const Ad = require('../models/Ad');
const User = require('../models/User');
const adTickets = require('../services/adTickets');
const adCredit = require('../services/adCredit');
const appAds = require('../services/appAds');

/** The signed-in person, if the request carries a good token; otherwise nobody. Never refuses. */
async function whoIsAsking(req) {
    try {
        const header = req.header('Authorization');
        if (!header) return null;
        const decoded = jwt.verify(header.replace('Bearer ', ''), process.env.JWT_SECRET);
        if (!decoded.userId) return null;
        return await User.findById(decoded.userId).select('searchHistory');
    } catch {
        return null;
    }
}

/** What the app is given for one ad. The host's script is never part of it. */
function served(ad, placement, req) {
    if (!ad) return null;
    const advertiser = ad.advertiserId && typeof ad.advertiserId === 'object' ? ad.advertiserId : null;
    const out = {
        id: String(ad._id),
        placement,
        title: ad.title,
        description: ad.description || '',
        imageUrl: ad.imageUrl,
        linkUrl: ad.linkUrl,
        cta: ad.cta || '',
        sponsor: (advertiser && advertiser.companyName) || '',
        // A chat is only offered when there is somebody on the other end to answer.
        chat: !!(ad.chatEnabled && advertiser && advertiser.chatUserId),
        ticket: adTickets.issue(String(ad._id), placement, req)
    };
    if (placement === 'app-takeover') {
        out.takeover = {
            format: ad.takeover?.format || 'skyscraper',
            mediaUrl: ad.takeover?.mediaUrl || '',
            durationSec: ad.takeover?.durationSec || 30
        };
    }
    return out;
}

/**
 * GET /api/ads/app?placements=app-lyrics,app-merch&q=what is on screen
 * One ad, or null, for each placement asked for.
 */
router.get('/', async (req, res) => {
    const out = {};
    try {
        const wanted = String(req.query.placements || '').split(',').map((p) => p.trim())
            .filter((p) => appAds.APP_PLACEMENTS[p] && p !== 'app-takeover').slice(0, 6);
        const context = String(req.query.q || '').slice(0, 300);
        const user = await whoIsAsking(req);
        for (const placement of wanted) {
            out[placement] = served(await appAds.pick(placement, context, user), placement, req);
        }
        res.json({ ads: out });
    } catch (error) {
        console.error('App ad error:', error);
        // No ad is always an acceptable answer; an error never reaches the screen.
        res.json({ ads: out });
    }
});

/** The room as the signalling layer holds it, and whether this person hosts it. */
function hostedRoom(roomId, userId) {
    const { getRoomById } = require('./signaling');
    const room = getRoomById(roomId);
    if (!room) return { room: null, isHost: false };
    const me = String(userId);
    const isHost = (room.creatorUserId && String(room.creatorUserId) === me)
        || Array.from(room.participants.values()).some((p) => p.isHost && String(p.userId) === me);
    return { room, isHost };
}

/**
 * GET /api/ads/app/takeovers?roomId=
 * The sponsor breaks this host may run in this room, script included.
 * Paid rooms only: a takeover is part of what a ticketed room sells.
 */
router.get('/takeovers', auth, async (req, res) => {
    try {
        const { room, isHost } = hostedRoom(String(req.query.roomId || ''), req.user._id);
        if (!room || !isHost) return res.json({ takeovers: [], reason: 'not_host' });
        if (!(room.tokenPrice > 0)) return res.json({ takeovers: [], reason: 'free_room' });

        const funded = await adCredit.fundedAdvertiserIds();
        if (!funded.length) return res.json({ takeovers: [] });
        const ads = await Ad.find({
            ...Ad.runningQuery(), placement: 'app-takeover', advertiserId: { $in: funded },
            $or: [{ 'takeover.hostUserIds': { $size: 0 } }, { 'takeover.hostUserIds': { $exists: false } }, { 'takeover.hostUserIds': req.user._id }]
        }).populate('advertiserId', 'companyName').limit(20);

        const contextText = appAds.normalise(`${room.name || ''} ${room.genre || ''}`);
        const list = ads
            .map((ad) => ({ ad, s: appAds.score(ad, contextText, appAds.normalise('')) }))
            // Booked for this host by name always shows; otherwise it has to fit the room.
            .filter((x) => x.s >= 0 || (x.ad.takeover?.hostUserIds || []).some((id) => String(id) === String(req.user._id)))
            .sort((a, b) => b.s - a.s)
            .map(({ ad }) => ({
                id: String(ad._id),
                title: ad.title,
                sponsor: ad.advertiserId?.companyName || '',
                format: ad.takeover?.format || 'skyscraper',
                durationSec: ad.takeover?.durationSec || 30,
                script: ad.takeover?.script || ''
            }));
        res.json({ takeovers: list });
    } catch (error) {
        console.error('Takeover list error:', error);
        res.json({ takeovers: [] });
    }
});

/**
 * GET /api/ads/app/serve/:adId
 * A running takeover, for each phone in the room: the creative and that
 * phone's own ticket. Only takeovers can be fetched by id; every other
 * placement is chosen by the server, never asked for by name.
 */
router.get('/serve/:adId', async (req, res) => {
    try {
        if (!/^[a-f0-9]{24}$/i.test(req.params.adId)) return res.json({ ad: null });
        const funded = await adCredit.fundedAdvertiserIds();
        const ad = await Ad.findOne({ ...Ad.runningQuery(), _id: req.params.adId, placement: 'app-takeover', advertiserId: { $in: funded } })
            .populate('advertiserId', 'companyName chatUserId');
        res.json({ ad: served(ad, 'app-takeover', req) });
    } catch (error) {
        console.error('Takeover serve error:', error);
        res.json({ ad: null });
    }
});

module.exports = router;
