const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const ScheduledRoom = require('../models/ScheduledRoom');
const { tipRoom } = require('../services/settlement');

// POST /api/rooms/:roomId/grant-pass — the room's creator comps a specific
// user's entry fee. JWT-authenticated: the caller's identity is verified,
// not taken from a socket payload. Capped to prevent bulk-comping abuse.
router.post('/:roomId/grant-pass', auth, async (req, res) => {
    try {
        const targetUserId = req.body && req.body.targetUserId;
        if (!targetUserId || typeof targetUserId !== 'string') {
            return res.status(400).json({ message: 'targetUserId is required' });
        }
        let room = null;
        try {
            const { getRoomsMap } = require('./signaling');
            room = getRoomsMap().get(req.params.roomId) || null;
        } catch (e) { /* signaling unavailable (tests) */ }
        if (!room) return res.status(404).json({ message: 'Room is not live' });
        if (!room.creatorUserId || String(room.creatorUserId) !== String(req.user._id)) {
            return res.status(403).json({ message: 'Only the room host can grant free passes' });
        }
        if (!(room.tokenPrice > 0)) {
            return res.json({ success: true, freePass: false, message: 'Room is free to enter' });
        }
        if (!Array.isArray(room.freeEntryUserIds)) room.freeEntryUserIds = [];
        if (!room.freeEntryUserIds.includes(String(targetUserId))) {
            if (room.freeEntryUserIds.length >= 50) {
                return res.status(409).json({ message: 'Free pass limit reached for this room' });
            }
            // Validate the target is a real user before granting
            const User = require('../models/User');
            const exists = await User.exists({ _id: targetUserId }).catch(() => null);
            if (!exists) return res.status(404).json({ message: 'User not found' });
            room.freeEntryUserIds.push(String(targetUserId));
            try {
                const { saveRoom } = require('../services/redisClient');
                await saveRoom(req.params.roomId, room);
            } catch (e) { /* Redis unavailable — in-memory grant still applies */ }
        }
        res.json({ success: true, freePass: true });
    } catch (err) {
        console.error('[GrantPass] error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /api/rooms/:roomId/info — lightweight pre-join info so clients can
// show the entry price (and whether the caller gets in free) BEFORE joining.
router.get('/:roomId/info', optionalAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        let room = null;
        try {
            const { getRoomsMap } = require('./signaling');
            room = getRoomsMap().get(req.params.roomId) || null;
        } catch (e) { /* signaling unavailable (tests) */ }
        if (!room) {
            // Not in memory — the room may still exist in Redis (e.g. right
            // after a server restart). Check there so paid rooms are never
            // reported as free/absent while still joinable.
            try {
                const { loadRoom } = require('../services/redisClient');
                room = await loadRoom(req.params.roomId);
            } catch (e) { /* Redis unavailable */ }
        }
        if (!room) return res.status(404).json({ message: 'Room is not live' });

        const uid = req.user ? String(req.user._id) : null;
        const freeEntry = !!(uid && (
            (room.creatorUserId && String(room.creatorUserId) === uid) ||
            (Array.isArray(room.freeEntryUserIds) && room.freeEntryUserIds.includes(uid))
        ));
        res.json({
            roomId: req.params.roomId,
            name: room.name || null,
            tokenPrice: room.tokenPrice || 0,
            freeEntry,
            isLive: true
        });
    } catch (err) {
        console.error('[RoomInfo] error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/rooms/:roomId/tip — tip tokens into a live room's pool.
// Atomic debit with refund compensation; rejected once the pool is closed.
router.post('/:roomId/tip', auth, async (req, res) => {
    try {
        const { roomId } = req.params;
        const amount = req.body && req.body.amount;

        // Room must be live (in the signaling layer)
        let room = null;
        try {
            const { getRoomsMap } = require('./signaling');
            room = getRoomsMap().get(roomId) || null;
        } catch (e) { /* signaling unavailable (tests) — rely on pool state */ }
        if (!room) {
            return res.status(404).json({ message: 'Room is not live' });
        }
        if (!room.creatorUserId) {
            return res.status(409).json({ message: 'This room cannot receive tips' });
        }

        // If the room came from a schedule, splits were snapshotted at open;
        // otherwise the pool is created lazily with 100% to the host.
        const sr = await ScheduledRoom.findOne({ liveRoomId: roomId }).select('_id');
        const result = await tipRoom({
            roomId,
            user: req.user,
            amount,
            hostUserId: room.creatorUserId,
            scheduledRoomId: sr ? sr._id : null
        });
        if (!result.ok) {
            return res.status(result.code).json({ message: result.message });
        }

        // Let the room see the tip in real time
        try {
            const io = req.app.get('io');
            if (io) {
                io.to(roomId).emit('room-tip', {
                    roomId,
                    fromUserName: req.user.name,
                    amount: Math.floor(Number(amount)),
                    poolBalance: result.poolBalance,
                    tipCount: result.tipCount
                });
            }
        } catch (e) { /* non-fatal */ }

        res.json({ success: true, balance: result.balance, poolBalance: result.poolBalance });
    } catch (err) {
        console.error('[Tips] error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
