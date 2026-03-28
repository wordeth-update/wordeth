const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Wager = require('../models/Wager');
const User = require('../models/User');
const TokenLedger = require('../models/TokenLedger');

async function deductTokens(userId, amount, type, relatedUserId) {
    const user = await User.findOneAndUpdate(
        { _id: userId, tokenBalance: { $gte: amount } },
        { $inc: { tokenBalance: -amount } },
        { new: true }
    );
    if (!user) return null;
    await TokenLedger.create({
        userId,
        type,
        amount: -amount,
        balanceBefore: user.tokenBalance + amount,
        balanceAfter: user.tokenBalance,
        relatedUserId
    });
    return user;
}

async function creditTokens(userId, amount, type, relatedUserId) {
    const user = await User.findOneAndUpdate(
        { _id: userId },
        { $inc: { tokenBalance: amount } },
        { new: true }
    );
    await TokenLedger.create({
        userId,
        type,
        amount,
        balanceBefore: user.tokenBalance - amount,
        balanceAfter: user.tokenBalance,
        relatedUserId
    });
    return user;
}

router.post('/create', auth, async (req, res) => {
    try {
        const { type, amount, matchId, roomId, roomName, description, side } = req.body;

        if (!type || !amount || amount < 1) {
            return res.status(400).json({ message: 'Type and valid amount are required' });
        }
        if (!['tournament_match', 'verse_game'].includes(type)) {
            return res.status(400).json({ message: 'Invalid wager type' });
        }
        if (type === 'tournament_match' && !matchId) {
            return res.status(400).json({ message: 'Match ID required for tournament wagers' });
        }
        if (type === 'verse_game' && !roomId) {
            return res.status(400).json({ message: 'Room ID required for verse game wagers' });
        }

        const user = await deductTokens(req.user._id, amount, 'wager_create', null);
        if (!user) {
            return res.status(400).json({ message: 'Insufficient token balance' });
        }

        const wager = await Wager.create({
            type,
            creatorId: req.user._id,
            matchId: matchId || null,
            roomId: roomId || null,
            roomName: roomName || '',
            description: (description || '').substring(0, 200),
            amount,
            participants: [{
                userId: req.user._id,
                userName: req.user.name || '',
                amount,
                side: side || 'A'
            }],
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        if (global._io && roomId) {
            global._io.to(roomId).emit('wager-created', {
                wagerId: wager._id,
                creatorName: req.user.name,
                amount,
                description: wager.description,
                type
            });
        }

        res.json({ wager, newBalance: user.tokenBalance });
    } catch (error) {
        console.error('Wager create error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/:id/accept', auth, async (req, res) => {
    try {
        const wager = await Wager.findById(req.params.id);
        if (!wager) return res.status(404).json({ message: 'Wager not found' });
        if (wager.status !== 'open') return res.status(400).json({ message: 'Wager is no longer open' });
        if (wager.creatorId.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'Cannot accept your own wager' });
        }

        const already = wager.participants.find(p => p.userId.toString() === req.user._id.toString());
        if (already) return res.status(400).json({ message: 'Already in this wager' });

        const side = req.body.side || 'B';
        const user = await deductTokens(req.user._id, wager.amount, 'wager_accept', wager.creatorId);
        if (!user) return res.status(400).json({ message: 'Insufficient token balance' });

        wager.participants.push({
            userId: req.user._id,
            userName: req.user.name || '',
            amount: wager.amount,
            side
        });
        wager.status = 'active';
        await wager.save();

        if (global._io && wager.roomId) {
            global._io.to(wager.roomId).emit('wager-accepted', {
                wagerId: wager._id,
                acceptorName: req.user.name,
                participants: wager.participants.length
            });
        }

        res.json({ wager, newBalance: user.tokenBalance });
    } catch (error) {
        console.error('Wager accept error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/:id/resolve', auth, async (req, res) => {
    try {
        const wager = await Wager.findById(req.params.id);
        if (!wager) return res.status(404).json({ message: 'Wager not found' });

        const isCreator = wager.creatorId.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'ADMIN';
        if (!isCreator && !isAdmin) {
            return res.status(403).json({ message: 'Only wager creator or admin can resolve' });
        }
        if (wager.status !== 'active') {
            return res.status(400).json({ message: 'Wager must be active to resolve' });
        }

        const { winnerId, winnerSide } = req.body;
        if (!winnerId && !winnerSide) {
            return res.status(400).json({ message: 'winnerId or winnerSide required' });
        }

        let winner;
        if (winnerId) {
            winner = wager.participants.find(p => p.userId.toString() === winnerId);
        } else {
            winner = wager.participants.find(p => p.side === winnerSide);
        }
        if (!winner) return res.status(400).json({ message: 'Winner not found in participants' });

        const totalPool = wager.participants.reduce((sum, p) => sum + p.amount, 0);
        await creditTokens(winner.userId, totalPool, 'wager_win', wager.creatorId);

        wager.winnerId = winner.userId;
        wager.winnerSide = winner.side;
        wager.status = 'resolved';
        wager.resolvedAt = new Date();
        winner.paidOut = true;
        await wager.save();

        if (global._io && wager.roomId) {
            global._io.to(wager.roomId).emit('wager-resolved', {
                wagerId: wager._id,
                winnerName: winner.userName,
                winnerAmount: totalPool
            });
        }

        res.json({ wager });
    } catch (error) {
        console.error('Wager resolve error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/:id/cancel', auth, async (req, res) => {
    try {
        const wager = await Wager.findById(req.params.id);
        if (!wager) return res.status(404).json({ message: 'Wager not found' });

        const isCreator = wager.creatorId.toString() === req.user._id.toString();
        if (!isCreator && req.user.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Only creator or admin can cancel' });
        }
        if (wager.status === 'resolved' || wager.status === 'cancelled') {
            return res.status(400).json({ message: 'Cannot cancel this wager' });
        }

        for (const p of wager.participants) {
            await creditTokens(p.userId, p.amount, 'wager_refund', wager.creatorId);
        }

        wager.status = 'cancelled';
        await wager.save();

        res.json({ wager });
    } catch (error) {
        console.error('Wager cancel error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/my', auth, async (req, res) => {
    try {
        const wagers = await Wager.find({
            'participants.userId': req.user._id
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
        res.json({ wagers });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/room/:roomId', auth, async (req, res) => {
    try {
        const wagers = await Wager.find({
            roomId: req.params.roomId,
            status: { $in: ['open', 'active'] }
        }).lean();
        res.json({ wagers });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/match/:matchId', auth, async (req, res) => {
    try {
        const wagers = await Wager.find({
            matchId: req.params.matchId,
            status: { $in: ['open', 'active'] }
        }).lean();
        res.json({ wagers });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
