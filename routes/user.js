const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const User = require('../models/User');

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

module.exports = router; 