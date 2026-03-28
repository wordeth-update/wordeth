const express = require('express');
const router = express.Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const UsageEvent = require('../models/UsageEvent');
const Notification = require('../models/Notification');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Please upload an image file'));
        }
        cb(null, true);
    }
});

router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json([]);
        }
        const searchTerm = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const users = await User.find({
            name: { $regex: searchTerm, $options: 'i' }
        })
        .select('name bio avatar createdAt')
        .limit(20);
        
        res.json(users.map(u => ({
            _id: u._id,
            name: u.name,
            bio: u.bio || '',
            avatar: u.avatar || 'assets/default-avatar.png',
            joinedAt: u.createdAt
        })));
    } catch (error) {
        console.error('User search error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/check-name', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name || name.trim().length < 2) {
            return res.json({ available: false });
        }
        const existing = await User.findOne({ name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
        res.json({ available: !existing });
    } catch (error) {
        res.status(500).json({ available: false });
    }
});

router.get('/profile', auth, async (req, res) => {
    try {
        res.json(req.user.getPublicProfile());
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/profile/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('name bio avatar createdAt following followers searchHistory showRoomHistory roomHistory');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        const profile = {
            _id: user._id,
            name: user.name,
            bio: user.bio || '',
            avatar: user.avatar || 'assets/default-avatar.png',
            createdAt: user.createdAt,
            followingCount: user.following?.length || 0,
            followersCount: user.followers?.length || 0,
            searchCount: user.searchHistory?.length || 0,
            showRoomHistory: user.showRoomHistory || false
        };
        if (user.showRoomHistory) {
            profile.roomHistory = user.roomHistory || [];
        }
        res.json(profile);
    } catch (error) {
        console.error('Public profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/profile', auth, async (req, res) => {
    try {
        const { name, bio } = req.body;
        const updates = {};

        if (name !== undefined) {
            const trimmed = name.trim();
            if (trimmed.length < 2) {
                return res.status(400).json({ message: 'Name must be at least 2 characters' });
            }
            if (trimmed.length > 50) {
                return res.status(400).json({ message: 'Name must be 50 characters or fewer' });
            }
            const existing = await User.findOne({
                name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                _id: { $ne: req.user._id }
            });
            if (existing) {
                return res.status(400).json({ message: 'That name is already taken. Please choose a different one.' });
            }
            updates.name = trimmed;
        }

        if (bio !== undefined) {
            if (bio.length > 300) {
                return res.status(400).json({ message: 'Bio must be 300 characters or fewer' });
            }
            updates.bio = bio.trim();
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'No valid fields to update' });
        }

        Object.assign(req.user, updates);
        await req.user.save();
        res.json(req.user.getPublicProfile());
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/avatar', auth, (req, res) => {
    upload.single('avatar')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'Image must be under 5MB' });
            }
            return res.status(400).json({ message: err.message || 'Upload failed' });
        }
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }
            const { Client } = require('@replit/object-storage');
            const objClient = new Client();
            const ext = req.file.mimetype.split('/')[1] || 'png';
            const objectName = `avatars/${req.user._id}.${ext}`;
            const result = await objClient.uploadFromBytes(objectName, req.file.buffer);
            if (!result.ok) {
                console.error('Object storage upload failed:', result.error);
                return res.status(500).json({ message: 'Error uploading avatar' });
            }
            const avatarUrl = `/api/user/avatar/${req.user._id}`;
            req.user.avatar = objectName;
            await req.user.save();
            res.json({ avatarUrl });
        } catch (error) {
            console.error('Avatar upload error:', error);
            res.status(500).json({ message: 'Error uploading avatar' });
        }
    });
});

router.get('/avatar/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('avatar');
        if (!user || !user.avatar) {
            return res.redirect('/assets/default-avatar.png');
        }
        if (user.avatar.startsWith('data:')) {
            const matches = user.avatar.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                const buffer = Buffer.from(matches[2], 'base64');
                res.set('Content-Type', matches[1]);
                res.set('Cache-Control', 'public, max-age=86400');
                return res.send(buffer);
            }
            return res.redirect('/assets/default-avatar.png');
        }
        if (user.avatar.startsWith('avatars/')) {
            const { Client } = require('@replit/object-storage');
            const objClient = new Client();
            const result = await objClient.downloadAsBytes(user.avatar);
            if (!result.ok) {
                return res.redirect('/assets/default-avatar.png');
            }
            const ext = user.avatar.split('.').pop();
            const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
            res.set('Content-Type', mimeMap[ext] || 'image/png');
            res.set('Cache-Control', 'public, max-age=86400');
            return res.send(Buffer.from(result.value));
        }
        return res.redirect(user.avatar);
    } catch (error) {
        console.error('Avatar fetch error:', error);
        res.redirect('/assets/default-avatar.png');
    }
});

// Get search history
router.get('/history', auth, async (req, res) => {
    try {
        res.json(req.user.searchHistory.sort((a, b) => b.timestamp - a.timestamp));
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Add to search history
router.post('/history', auth, async (req, res) => {
    try {
        const { songTitle, artist } = req.body;
        if (!songTitle || typeof songTitle !== 'string' || songTitle.length > 200) {
            return res.status(400).json({ message: 'Invalid songTitle' });
        }
        req.user.searchHistory.unshift({ songTitle, artist });
        req.user.searchHistory = req.user.searchHistory.slice(0, 100);
        await req.user.save();
        res.json(req.user.searchHistory);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/room-history', auth, async (req, res) => {
    try {
        res.json(req.user.roomHistory || []);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/room-history-visibility', auth, async (req, res) => {
    try {
        const { visible } = req.body;
        if (typeof visible !== 'boolean') {
            return res.status(400).json({ message: 'visible must be a boolean' });
        }
        req.user.showRoomHistory = visible;
        await req.user.save();
        res.json({ showRoomHistory: req.user.showRoomHistory });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get friends (following)
router.get('/friends', auth, async (req, res) => {
    try {
        await req.user.populate('following');
        const friends = req.user.following.map(friend => ({
            _id: friend._id,
            name: friend.name,
            bio: friend.bio || '',
            avatar: friend.avatar || ''
        }));
        res.json(friends);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Follow user
router.post('/friends/:id', auth, async (req, res) => {
    try {
        const targetId = req.params.id;

        if (req.user._id.toString() === targetId) {
            return res.status(400).json({ message: 'You cannot follow yourself' });
        }

        const userToFollow = await User.findById(targetId);
        if (!userToFollow) {
            return res.status(404).json({ message: 'User not found' });
        }

        const alreadyFollowing = req.user.following.some(
            id => id.toString() === targetId
        );

        if (alreadyFollowing) {
            return res.json({ message: 'Already following', following: req.user.following });
        }

        req.user.following.push(userToFollow._id);
        userToFollow.followers.push(req.user._id);
        await Promise.all([req.user.save(), userToFollow.save()]);

        Notification.create({
            userId: userToFollow._id,
            type: 'new_follower',
            fromUserId: req.user._id,
            fromUserName: req.user.name || '',
            fromUserAvatar: req.user.avatar || ''
        }).catch(err => console.error('[Notification] new_follower error:', err));

        res.json({ message: 'Followed successfully', following: req.user.following });
    } catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ message: 'Could not follow user. Please try again.' });
    }
});

// Get custom merch
router.get('/merch', auth, async (req, res) => {
    try {
        res.json(req.user.customMerch.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/merch', auth, upload.single('image'), async (req, res) => {
    try {
        const { name, type } = req.body;
        let image = '';
        if (req.file) {
            const base64 = req.file.buffer.toString('base64');
            image = `data:${req.file.mimetype};base64,${base64}`;
        }
        req.user.customMerch.unshift({ name, type, image });
        await req.user.save();
        res.json(req.user.customMerch);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

const { requireRole } = require('../middleware/rbac');

router.post('/admin/flush', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'User email is required' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ error: 'No user found with that email' });
        }

        const userId = user._id;
        const flushed = { email: user.email, name: user.name, deletedData: {} };

        const eventsDeleted = await UsageEvent.deleteMany({ userId });
        flushed.deletedData.usageEvents = eventsDeleted.deletedCount;

        const followersUpdated = await User.updateMany(
            { following: userId },
            { $pull: { following: userId } }
        );
        flushed.deletedData.followersRemoved = followersUpdated.modifiedCount;

        const followingUpdated = await User.updateMany(
            { followers: userId },
            { $pull: { followers: userId } }
        );
        flushed.deletedData.followingRemoved = followingUpdated.modifiedCount;


        await User.findByIdAndDelete(userId);
        flushed.deletedData.accountDeleted = true;
        flushed.flushedAt = new Date().toISOString();

        res.json({ success: true, message: 'User data has been permanently deleted', details: flushed });
    } catch (error) {
        console.error('Data flush error:', error);
        res.status(500).json({ error: 'Failed to flush user data' });
    }
});

router.get('/notifications', auth, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });
        res.json({ notifications, unreadCount });
    } catch (error) {
        console.error('Notifications fetch error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/notifications/read-all', auth, async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/notifications/:id/read', auth, async (req, res) => {
    try {
        const notif = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: { read: true } },
            { new: true }
        );
        if (!notif) return res.status(404).json({ message: 'Not found' });
        res.json(notif);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/account', auth, async (req, res) => {
    try {
        const userId = req.user._id;
        const flushed = {};

        const eventsDeleted = await UsageEvent.deleteMany({ userId });
        flushed.usageEvents = eventsDeleted.deletedCount;

        await User.updateMany({ following: userId }, { $pull: { following: userId } });
        await User.updateMany({ followers: userId }, { $pull: { followers: userId } });


        await User.findByIdAndDelete(userId);

        res.json({ success: true, message: 'Your account and all associated data have been permanently deleted' });
    } catch (error) {
        console.error('Self-delete error:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

module.exports = router; 