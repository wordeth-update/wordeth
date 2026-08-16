const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ScheduledRoom = require('../models/ScheduledRoom');
const { tipRoom } = require('../services/settlement');

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
