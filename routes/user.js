const express = require('express');
const router = express.Router();

const { artworkUrl } = require('../services/artwork');
const { avatarRef } = require('../services/avatarRef');
/** How many of the newest history entries are given a picture when they have none. */
const HISTORY_ART_BACKFILL = 24;
/** A real picture: https, and not Musixmatch's "nocover" placeholder. */
const usableArt = (image) => typeof image === 'string' && /^https:\/\//.test(image) && !/nocover/i.test(image);
const multer = require('multer');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const limits = require('../middleware/limits');
const User = require('../models/User');
const UsageEvent = require('../models/UsageEvent');
const Notification = require('../models/Notification');
const AudioBank = require('../models/AudioBank');
const TokenLedger = require('../models/TokenLedger');

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

const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('audio/') && !file.mimetype.includes('webm') && !file.mimetype.includes('ogg')) {
            return cb(new Error('Please upload an audio file'));
        }
        cb(null, true);
    }
});

router.get('/search', limits.search, async (req, res) => {
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
            avatar: avatarRef(u._id, u.avatar, 'assets/default-avatar.png'),
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
            .select('name bio avatar createdAt following followers searchHistory showRoomHistory roomHistory extendedBio profilePhotos musicSnippet favoriteLyric accountType');
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
            // One number for the profile: everyone connected in either direction.
            connectionsCount: new Set([...(user.following || []), ...(user.followers || [])].map(String)).size,
            searchCount: user.searchHistory?.length || 0,
            showRoomHistory: user.showRoomHistory || false
        };
        if (user.showRoomHistory) {
            profile.roomHistory = user.roomHistory || [];
        }
        profile.extendedBio = user.extendedBio || '';
        profile.accountType = user.accountType || 'fan';
        profile.favoriteLyric = user.favoriteLyric && user.favoriteLyric.text ? {
            text: user.favoriteLyric.text,
            song: user.favoriteLyric.song || '',
            artist: user.favoriteLyric.artist || ''
        } : null;
        profile.profilePhotos = user.profilePhotos || [];
        if (user.musicSnippet && user.musicSnippet.url) {
            const snippet = user.musicSnippet;
            if (!snippet.isRented || !snippet.expiresAt || snippet.expiresAt > new Date()) {
                profile.musicSnippet = {
                    url: snippet.url,
                    title: snippet.title || '',
                    artist: snippet.artist || '',
                    isRented: snippet.isRented || false
                };
            }
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

router.post('/avatar', auth, limits.upload, (req, res) => {
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
            const fileStorage = require('../services/fileStorage');
            const ext = req.file.mimetype.split('/')[1] || 'png';
            const objectName = `avatars/${req.user._id}.${ext}`;
            await fileStorage.uploadBytes(objectName, req.file.buffer, req.file.mimetype);
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
            const ext = user.avatar.split('.').pop();
            const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
            // MongoDB first, then legacy Replit storage for pre-migration avatars
            const fileStorage = require('../services/fileStorage');
            const stored = await fileStorage.downloadBytes(user.avatar).catch(() => null);
            if (stored) {
                res.set('Content-Type', stored.file.contentType || mimeMap[ext] || 'image/png');
                res.set('Cache-Control', 'public, max-age=86400');
                return res.send(stored.buffer);
            }
            try {
                const { Client } = require('@replit/object-storage');
                const objClient = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
                    ? new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID })
                    : new Client();
                const result = await objClient.downloadAsBytes(user.avatar);
                if (result.ok) {
                    res.set('Content-Type', mimeMap[ext] || 'image/png');
                    res.set('Cache-Control', 'public, max-age=86400');
                    return res.send(Buffer.from(result.value));
                }
            } catch (e) { /* not on Replit */ }
            return res.redirect('/assets/default-avatar.png');
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
        const list = req.user.searchHistory.sort((a, b) => b.timestamp - a.timestamp);
        // The cards at the front are the ones on screen. Any of them saved
        // without a picture — every entry from before cards existed, and any
        // song Musixmatch had no cover for — gets one now, and keeps it.
        const bare = list.slice(0, HISTORY_ART_BACKFILL).filter((h) => !usableArt(h.image) && !h.artChecked);
        if (bare.length > 0) {
            await Promise.all(bare.map(async (h) => {
                const found = await artworkUrl(h.artist, h.songTitle);
                if (found) h.image = found;
                // Asked once. A song with no picture anywhere is not asked about on every open.
                h.artChecked = true;
            }));
            req.user.save().catch((e) => console.warn('[History] artwork save error:', e.message));
        }
        res.json(list);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Add to search history
router.post('/history', auth, async (req, res) => {
    try {
        const { songTitle, artist, trackId, image, album } = req.body;
        if (!songTitle || typeof songTitle !== 'string' || songTitle.length > 200) {
            return res.status(400).json({ message: 'Invalid songTitle' });
        }
        const entry = {
            songTitle,
            artist: typeof artist === 'string' ? artist.slice(0, 200) : '',
            trackId: Number.isInteger(trackId) && trackId > 0 ? trackId : null,
            image: usableArt(image) ? image.slice(0, 500) : '',
            album: typeof album === 'string' ? album.slice(0, 200) : '',
            timestamp: new Date()
        };
        if (!entry.image) {
            entry.image = await artworkUrl(entry.artist, entry.songTitle);
            entry.artChecked = true;
        }
        // One card per song: opening it again moves it to the front rather
        // than filling the row with the same cover.
        const same = (h) => (entry.trackId && h.trackId === entry.trackId)
            || (String(h.songTitle).toLowerCase() === songTitle.toLowerCase()
                && String(h.artist || '').toLowerCase() === entry.artist.toLowerCase());
        req.user.searchHistory = req.user.searchHistory.filter((h) => !same(h));
        req.user.searchHistory.unshift(entry);
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
            avatar: avatarRef(friend._id, friend.avatar)
        }));
        res.json(friends);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * Connections: everyone you have dapped up and everyone who has dapped you,
 * as one list. Whoever is online comes first, then whoever was around most
 * recently — the order an invite sheet wants. `youDapped` / `theyDapped`
 * say which way each one runs, so the app can offer "Dap back".
 */
router.get('/connections', auth, async (req, res) => {
    try {
        const mine = new Set((req.user.following || []).map(String));
        const theirs = new Set((req.user.followers || []).map(String));
        const ids = Array.from(new Set([...mine, ...theirs])).slice(0, 500);
        if (ids.length === 0) return res.json([]);
        const people = await User.find({ _id: { $in: ids } }).select('name bio avatar lastSeenAt').lean();
        const online = global._connectedUsers;
        const list = people.map(p => {
            const id = String(p._id);
            return {
                _id: id,
                name: p.name || '',
                bio: p.bio || '',
                avatar: avatarRef(p._id, p.avatar),
                online: !!(online && online.has(id)),
                lastSeenAt: p.lastSeenAt || null,
                youDapped: mine.has(id),
                theyDapped: theirs.has(id)
            };
        });
        list.sort((a, b) => {
            if (a.online !== b.online) return a.online ? -1 : 1;
            const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
            const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
            if (at !== bt) return bt - at;
            return a.name.localeCompare(b.name);
        });
        res.json(list.slice(0, 200));
    } catch (error) {
        console.error('Connections error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Follow user
router.post('/friends/:id', auth, async (req, res) => {
    try {
        const targetId = req.params.id;

        if (req.user._id.toString() === targetId) {
            return res.status(400).json({ message: 'You cannot dap yourself up' });
        }

        const userToFollow = await User.findById(targetId);
        if (!userToFollow) {
            return res.status(404).json({ message: 'User not found' });
        }

        const alreadyFollowing = req.user.following.some(
            id => id.toString() === targetId
        );

        if (alreadyFollowing) {
            return res.json({ message: 'Already connected', following: req.user.following });
        }

        req.user.following.push(userToFollow._id);
        userToFollow.followers.push(req.user._id);
        await Promise.all([req.user.save(), userToFollow.save()]);

        Notification.create({
            userId: userToFollow._id,
            type: 'new_follower',
            fromUserId: req.user._id,
            fromUserName: req.user.name || '',
            fromUserAvatar: avatarRef(req.user._id, req.user.avatar)
        }).catch(err => console.error('[Notification] new_follower error:', err));

        res.json({ message: 'Dapped up', following: req.user.following });
    } catch (error) {
        console.error('Follow error:', error);
        res.status(500).json({ message: 'Could not dap up. Please try again.' });
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

/**
 * What the system knows about an email, before anyone deletes it.
 *
 * A tester was told their address already had an account and could not
 * sign up. The only admin tool was flush, which removes the account without
 * showing what it was. This answers the question first: does an account
 * exist, since when, under what name and role. Nothing is changed.
 */
router.get('/admin/lookup', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const raw = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
        if (!raw) return res.status(400).json({ error: 'email is required' });
        const user = await User.findOne({ email: raw }).select('name email role createdAt creatorProfile.handle');
        if (!user) return res.json({ exists: false, email: raw });
        res.json({
            exists: true,
            email: user.email,
            name: user.name,
            role: user.role,
            createdAt: user.createdAt,
            creatorHandle: user.creatorProfile && user.creatorProfile.handle ? user.creatorProfile.handle : null,
        });
    } catch (error) {
        console.error('Admin lookup error:', error);
        res.status(500).json({ error: 'Lookup failed' });
    }
});

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

router.put('/profile-customize', auth, async (req, res) => {
    try {
        const { extendedBio, favoriteLyric } = req.body;
        if (extendedBio !== undefined) {
            if (typeof extendedBio !== 'string' || extendedBio.length > 2000) {
                return res.status(400).json({ message: 'Extended bio must be 2000 characters or fewer' });
            }
            req.user.extendedBio = extendedBio.trim();
        }
        // The favourite lyric: a line, and where it is from. An empty line
        // clears it. Lengths are checked here so the reply is a sentence
        // rather than a Mongoose validation dump.
        if (favoriteLyric !== undefined) {
            const text = typeof favoriteLyric?.text === 'string' ? favoriteLyric.text.trim() : '';
            const song = typeof favoriteLyric?.song === 'string' ? favoriteLyric.song.trim() : '';
            const artist = typeof favoriteLyric?.artist === 'string' ? favoriteLyric.artist.trim() : '';
            if (text.length > 280) {
                return res.status(400).json({ message: 'A favorite lyric can be 280 characters.' });
            }
            if (song.length > 120 || artist.length > 120) {
                return res.status(400).json({ message: 'The song and artist can be 120 characters each.' });
            }
            req.user.favoriteLyric = text
                ? { text, song, artist, updatedAt: new Date() }
                : { text: '', song: '', artist: '', updatedAt: null };
        }
        await req.user.save();
        const lyric = req.user.favoriteLyric && req.user.favoriteLyric.text
            ? { text: req.user.favoriteLyric.text, song: req.user.favoriteLyric.song || '', artist: req.user.favoriteLyric.artist || '' }
            : null;
        res.json({ success: true, extendedBio: req.user.extendedBio, favoriteLyric: lyric });
    } catch (error) {
        console.error('Profile customize error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/profile-photo', auth, limits.upload, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No photo provided' });
        if (req.user.profilePhotos && req.user.profilePhotos.length >= 6) {
            return res.status(400).json({ message: 'Maximum 6 profile photos allowed' });
        }
        const fileStorage = require('../services/fileStorage');
        const rand = require('crypto').randomBytes(8).toString('hex');
        const key = `profile-photos/${req.user._id}-${Date.now()}-${rand}.jpg`;
        const { url } = await fileStorage.uploadBytes(key, req.file.buffer, req.file.mimetype || 'image/jpeg');

        req.user.profilePhotos.push({
            url,
            caption: (req.body.caption || '').substring(0, 100)
        });
        await req.user.save();
        res.json({ success: true, profilePhotos: req.user.profilePhotos });
    } catch (error) {
        console.error('Profile photo error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/profile-photo/:index', auth, async (req, res) => {
    try {
        const idx = parseInt(req.params.index);
        if (isNaN(idx) || idx < 0 || idx >= (req.user.profilePhotos || []).length) {
            return res.status(400).json({ message: 'Invalid photo index' });
        }
        req.user.profilePhotos.splice(idx, 1);
        await req.user.save();
        res.json({ success: true, profilePhotos: req.user.profilePhotos });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/music-snippet', auth, limits.upload, audioUpload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No audio file provided' });
        const fileStorage = require('../services/fileStorage');
        const rand = require('crypto').randomBytes(8).toString('hex');
        const key = `music-snippets/${req.user._id}-${Date.now()}-${rand}.webm`;
        const { url } = await fileStorage.uploadBytes(key, req.file.buffer, req.file.mimetype || 'audio/webm');

        req.user.musicSnippet = {
            url,
            title: (req.body.title || '').substring(0, 100),
            artist: (req.body.artist || '').substring(0, 100),
            isRented: false,
            rentedFromId: null,
            expiresAt: null,
            uploadedAt: new Date()
        };
        await req.user.save();
        res.json({ success: true, musicSnippet: req.user.musicSnippet });
    } catch (error) {
        console.error('Music snippet upload error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/music-snippet', auth, async (req, res) => {
    try {
        req.user.musicSnippet = {
            url: null, title: '', artist: '',
            isRented: false, rentedFromId: null, expiresAt: null, uploadedAt: null
        };
        await req.user.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/audio-bank', async (req, res) => {
    try {
        const { genre, mood, search, sort, featured } = req.query;
        const query = { active: true };
        if (genre && genre !== 'all') query.genre = genre;
        if (mood && mood !== 'all') query.mood = mood;
        if (featured === 'true') query.featured = true;
        if (search && search.trim().length >= 2) {
            const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { title: { $regex: term, $options: 'i' } },
                { artist: { $regex: term, $options: 'i' } },
                { tags: { $regex: term, $options: 'i' } }
            ];
        }

        let sortObj = { totalRentals: -1 };
        if (sort === 'newest') sortObj = { createdAt: -1 };
        else if (sort === 'price_low') sortObj = { tokenPrice: 1 };
        else if (sort === 'price_high') sortObj = { tokenPrice: -1 };
        else if (sort === 'popular') sortObj = { totalRentals: -1 };

        const tracks = await AudioBank.find(query).sort(sortObj).limit(60).lean();

        const genresAgg = await AudioBank.distinct('genre', { active: true });
        const moodsAgg = await AudioBank.distinct('mood', { active: true });

        res.json({ tracks, genres: genresAgg, moods: moodsAgg });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/rent-snippet', auth, async (req, res) => {
    try {
        const { trackId } = req.body;
        if (!trackId) return res.status(400).json({ message: 'Track ID required' });

        const track = await AudioBank.findById(trackId);
        if (!track || !track.active) return res.status(404).json({ message: 'Track not found' });

        if (req.user.tokenBalance < track.tokenPrice) {
            return res.status(400).json({ message: 'Insufficient tokens' });
        }

        const balBefore = req.user.tokenBalance;
        req.user.tokenBalance -= track.tokenPrice;
        req.user.musicSnippet = {
            url: track.audioUrl,
            title: track.title,
            artist: track.artist,
            isRented: true,
            rentedFromId: track._id,
            expiresAt: new Date(Date.now() + track.rentalDays * 24 * 60 * 60 * 1000),
            uploadedAt: new Date()
        };
        await req.user.save();

        await TokenLedger.create({
            userId: req.user._id,
            type: 'snippet_rental',
            amount: -track.tokenPrice,
            balanceBefore: balBefore,
            balanceAfter: req.user.tokenBalance
        });

        track.totalRentals += 1;
        await track.save();

        res.json({
            success: true,
            musicSnippet: req.user.musicSnippet,
            newBalance: req.user.tokenBalance
        });
    } catch (error) {
        console.error('Rent snippet error:', error);
        res.status(500).json({ message: 'Server error' });
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

// ── Push tokens (native app) ──────────────────────────────────────────
const { isExpoToken } = require('../services/push');

// Register this device for push. Idempotent: the same token updates in place.
router.post('/push-token', auth, limits.pushToken, async (req, res) => {
    try {
        const { token, platform } = req.body || {};
        if (!isExpoToken(token)) return res.status(400).json({ message: 'A valid Expo push token is required' });
        if (!['ios', 'android'].includes(platform)) return res.status(400).json({ message: 'platform must be ios or android' });
        await User.updateOne({ _id: req.user._id }, { $pull: { pushTokens: { token } } });
        await User.updateOne(
            { _id: req.user._id },
            { $push: { pushTokens: { $each: [{ token, platform, updatedAt: new Date() }], $slice: -10 } } }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Push token error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Forget this device (sign-out on the phone).
router.delete('/push-token', auth, limits.pushToken, async (req, res) => {
    try {
        const { token } = req.body || {};
        if (!isExpoToken(token)) return res.status(400).json({ message: 'A valid Expo push token is required' });
        await User.updateOne({ _id: req.user._id }, { $pull: { pushTokens: { token } } });
        res.json({ success: true });
    } catch (error) {
        console.error('Push token error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router; 