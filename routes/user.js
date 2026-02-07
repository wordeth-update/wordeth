const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const UsageEvent = require('../models/UsageEvent');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
            return cb(new Error('Please upload an image file'));
        }
        cb(null, true);
    }
});

// Get user profile
router.get('/profile', auth, async (req, res) => {
    try {
        res.json(req.user.getPublicProfile());
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update avatar
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
    try {
        req.user.avatar = `/uploads/${req.file.filename}`;
        await req.user.save();
        res.json({ avatarUrl: req.user.avatar });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading avatar' });
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
        req.user.searchHistory.unshift({ songTitle, artist });
        await req.user.save();
        res.json(req.user.searchHistory);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get annotations
router.get('/annotations', auth, async (req, res) => {
    try {
        res.json(req.user.annotations.sort((a, b) => b.timestamp - a.timestamp));
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Add annotation
router.post('/annotations', auth, async (req, res) => {
    try {
        const { songTitle, text } = req.body;
        req.user.annotations.unshift({ songTitle, text });
        await req.user.save();
        res.json(req.user.annotations);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get friends (following)
router.get('/friends', auth, async (req, res) => {
    try {
        await req.user.populate('following');
        const friends = req.user.following.map(friend => ({
            ...friend.getPublicProfile(),
            mutualSongs: Math.floor(Math.random() * 50) // Placeholder for actual mutual songs logic
        }));
        res.json(friends);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Follow user
router.post('/friends/:id', auth, async (req, res) => {
    try {
        const userToFollow = await User.findById(req.params.id);
        if (!userToFollow) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!req.user.following.includes(userToFollow._id)) {
            req.user.following.push(userToFollow._id);
            userToFollow.followers.push(req.user._id);
            await Promise.all([req.user.save(), userToFollow.save()]);
        }

        res.json(req.user.following);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
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

// Add custom merch
router.post('/merch', auth, upload.single('image'), async (req, res) => {
    try {
        const { name, type } = req.body;
        const image = `/uploads/${req.file.filename}`;
        
        req.user.customMerch.unshift({ name, type, image });
        await req.user.save();
        res.json(req.user.customMerch);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ error: 'Server configuration error' });
        }
        const decoded = jwt.verify(token, jwtSecret);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.adminId = decoded.advertiserId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

router.post('/admin/flush', authenticateAdmin, async (req, res) => {
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

        if (user.avatar && user.avatar.startsWith('/uploads/')) {
            const avatarPath = path.join(__dirname, '..', user.avatar);
            if (fs.existsSync(avatarPath)) {
                fs.unlinkSync(avatarPath);
                flushed.deletedData.avatarRemoved = true;
            }
        }

        await User.findByIdAndDelete(userId);
        flushed.deletedData.accountDeleted = true;
        flushed.flushedAt = new Date().toISOString();

        res.json({ success: true, message: 'User data has been permanently deleted', details: flushed });
    } catch (error) {
        console.error('Data flush error:', error);
        res.status(500).json({ error: 'Failed to flush user data' });
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

        if (req.user.avatar && req.user.avatar.startsWith('/uploads/')) {
            const avatarPath = path.join(__dirname, '..', req.user.avatar);
            if (fs.existsSync(avatarPath)) {
                fs.unlinkSync(avatarPath);
            }
        }

        await User.findByIdAndDelete(userId);

        res.json({ success: true, message: 'Your account and all associated data have been permanently deleted' });
    } catch (error) {
        console.error('Self-delete error:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

module.exports = router; 