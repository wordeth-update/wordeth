const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const User = require('../models/User');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/') || file.mimetype === 'application/octet-stream') {
            cb(null, true);
        } else {
            cb(new Error('Only audio files allowed'), false);
        }
    }
});

router.get('/conversations', auth, async (req, res) => {
    try {
        const userId = req.user._id;
        const messages = await Message.aggregate([
            { $match: { $or: [{ senderId: userId }, { receiverId: userId }] } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: {
                        $cond: [{ $eq: ['$senderId', userId] }, '$receiverId', '$senderId']
                    },
                    lastMessage: { $first: '$$ROOT' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ['$receiverId', userId] }, { $eq: ['$read', false] }] },
                                1, 0
                            ]
                        }
                    }
                }
            },
            { $sort: { 'lastMessage.createdAt': -1 } },
            { $limit: 50 }
        ]);

        const otherUserIds = messages.map(m => m._id);
        const users = await User.find({ _id: { $in: otherUserIds } })
            .select('name avatar bio')
            .lean();
        const userMap = {};
        users.forEach(u => { userMap[u._id.toString()] = u; });

        const conversations = messages.map(m => {
            const otherUser = userMap[m._id.toString()] || {};
            return {
                userId: m._id,
                userName: otherUser.name || 'Unknown',
                avatar: otherUser.avatar || 'assets/default-avatar.png',
                lastMessage: {
                    text: m.lastMessage.text || (m.lastMessage.audioUrl ? '🎤 Audio message' : ''),
                    createdAt: m.lastMessage.createdAt,
                    isAudio: !!m.lastMessage.audioUrl,
                    fromMe: m.lastMessage.senderId.toString() === userId.toString()
                },
                unreadCount: m.unreadCount
            };
        });

        res.json({ conversations });
    } catch (error) {
        console.error('Conversations error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/:userId', auth, async (req, res) => {
    try {
        const myId = req.user._id;
        const otherId = req.params.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = 50;

        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: otherId },
                { senderId: otherId, receiverId: myId }
            ]
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

        await Message.updateMany(
            { senderId: otherId, receiverId: myId, read: false },
            { $set: { read: true } }
        );

        const otherUser = await User.findById(otherId).select('name avatar').lean();

        res.json({
            messages: messages.reverse(),
            otherUser: otherUser || { name: 'Unknown', avatar: 'assets/default-avatar.png' },
            hasMore: messages.length === limit
        });
    } catch (error) {
        console.error('Messages fetch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/:userId', auth, upload.single('audio'), async (req, res) => {
    try {
        const myId = req.user._id;
        const otherId = req.params.userId;

        if (myId.toString() === otherId) {
            return res.status(400).json({ message: 'Cannot message yourself' });
        }

        const otherUser = await User.findById(otherId).select('_id').lean();
        if (!otherUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const msgData = {
            senderId: myId,
            receiverId: otherId,
            text: (req.body.text || '').trim().substring(0, 2000)
        };

        if (req.file) {
            try {
                const fileStorage = require('../services/fileStorage');
                const rand = require('crypto').randomBytes(8).toString('hex');
                const key = `audio-messages/${myId}-${Date.now()}-${rand}.webm`;
                const { url } = await fileStorage.uploadBytes(key, req.file.buffer, req.file.mimetype || 'audio/webm');
                msgData.audioUrl = url;
                msgData.audioExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
            } catch (uploadErr) {
                console.error('Audio upload error:', uploadErr);
            }
        }

        if (!msgData.text && !msgData.audioUrl) {
            return res.status(400).json({ message: 'Message cannot be empty' });
        }

        const message = await Message.create(msgData);

        if (global._io) {
            const connectedUsers = global._connectedUsers;
            if (connectedUsers) {
                const recipientSockets = connectedUsers.get(otherId.toString());
                if (recipientSockets && recipientSockets.size > 0) {
                    for (const sid of recipientSockets) {
                        global._io.to(sid).emit('new-message', {
                            _id: message._id,
                            senderId: myId,
                            senderName: req.user.name,
                            senderAvatar: req.user.avatar,
                            text: message.text,
                            audioUrl: message.audioUrl || null,
                            createdAt: message.createdAt
                        });
                    }
                }
            }
        }

        res.json(message);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/:id/read', auth, async (req, res) => {
    try {
        await Message.findOneAndUpdate(
            { _id: req.params.id, receiverId: req.user._id },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
