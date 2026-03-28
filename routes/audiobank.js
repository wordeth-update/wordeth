const express = require('express');
const router = express.Router();
const multer = require('multer');
const AudioBank = require('../models/AudioBank');
const ApiKey = require('../models/ApiKey');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'audio' || file.fieldname === 'preview') {
            if (!file.mimetype.startsWith('audio/') && !file.mimetype.includes('webm') && !file.mimetype.includes('ogg')) {
                return cb(new Error('Audio files only'));
            }
        } else if (file.fieldname === 'cover') {
            if (!file.mimetype.startsWith('image/')) {
                return cb(new Error('Image files only'));
            }
        }
        cb(null, true);
    }
});

async function apiKeyAuth(req, res, next) {
    try {
        const key = req.header('X-API-Key');
        if (!key) return res.status(401).json({ error: 'API key required', code: 'AUTH_MISSING' });

        const hash = ApiKey.hashKey(key);
        const apiKey = await ApiKey.findOne({ keyHash: hash, active: true });
        if (!apiKey) return res.status(401).json({ error: 'Invalid or inactive API key', code: 'AUTH_INVALID' });

        apiKey.lastUsed = new Date();
        apiKey.totalRequests += 1;
        await apiKey.save();

        req.apiKey = apiKey;
        next();
    } catch (error) {
        console.error('API key auth error:', error);
        res.status(500).json({ error: 'Authentication error', code: 'AUTH_ERROR' });
    }
}

function requirePerm(perm) {
    return (req, res, next) => {
        if (!req.apiKey.permissions.includes(perm)) {
            return res.status(403).json({ error: 'Insufficient permissions', code: 'PERM_DENIED' });
        }
        next();
    };
}

router.post('/tracks', apiKeyAuth, requirePerm('audiobank:submit'), upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'preview', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, artist, genre, mood, bpm, tokenPrice, rentalDays, tags, duration } = req.body;
        if (!title) return res.status(400).json({ error: 'Title is required', code: 'VALIDATION' });
        if (!req.files || !req.files.audio) return res.status(400).json({ error: 'Audio file is required', code: 'VALIDATION' });
        if (!tokenPrice || parseInt(tokenPrice) < 1) return res.status(400).json({ error: 'Valid token price is required', code: 'VALIDATION' });

        const { Client } = require('@replit/object-storage');
        const client = new Client();
        const ts = Date.now();

        const audioKey = `audiobank/${ts}-${req.files.audio[0].originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        await client.uploadFromBytes(audioKey, req.files.audio[0].buffer);
        const audioResult = await client.getSignedDownloadUrl(audioKey);
        if (!audioResult.ok) return res.status(500).json({ error: 'Audio upload failed', code: 'UPLOAD_FAIL' });

        let previewUrl = '';
        if (req.files.preview) {
            const previewKey = `audiobank/preview-${ts}-${req.files.preview[0].originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            await client.uploadFromBytes(previewKey, req.files.preview[0].buffer);
            const previewResult = await client.getSignedDownloadUrl(previewKey);
            if (previewResult.ok) previewUrl = previewResult.value;
        }

        let coverArt = '';
        if (req.files.cover) {
            const coverKey = `audiobank/cover-${ts}-${req.files.cover[0].originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            await client.uploadFromBytes(coverKey, req.files.cover[0].buffer);
            const coverResult = await client.getSignedDownloadUrl(coverKey);
            if (coverResult.ok) coverArt = coverResult.value;
        }

        const track = await AudioBank.create({
            title,
            artist: artist || req.apiKey.organization,
            genre: genre || 'general',
            mood: mood || 'chill',
            bpm: bpm ? parseInt(bpm) : 0,
            duration: duration ? parseInt(duration) : 30,
            tokenPrice: parseInt(tokenPrice),
            rentalDays: rentalDays ? parseInt(rentalDays) : 30,
            tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
            audioUrl: audioResult.value,
            previewUrl,
            coverArt,
            active: false,
            submittedBy: req.apiKey.name,
            submittedByKeyId: req.apiKey._id
        });

        res.status(201).json({
            success: true,
            track: {
                id: track._id,
                title: track.title,
                artist: track.artist,
                status: 'pending_review',
                message: 'Track submitted successfully. It will be reviewed before going live.'
            }
        });
    } catch (error) {
        console.error('Audio Bank API submit error:', error);
        res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
    }
});

router.get('/tracks', apiKeyAuth, requirePerm('audiobank:read'), async (req, res) => {
    try {
        const { status, genre, mood, page, limit: lim } = req.query;
        const query = { submittedByKeyId: req.apiKey._id };
        if (status === 'active') query.active = true;
        else if (status === 'pending') query.active = false;
        if (genre) query.genre = genre;
        if (mood) query.mood = mood;

        const pageNum = Math.max(1, parseInt(page) || 1);
        const pageSize = Math.min(50, Math.max(1, parseInt(lim) || 20));

        const [tracks, total] = await Promise.all([
            AudioBank.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * pageSize).limit(pageSize).lean(),
            AudioBank.countDocuments(query)
        ]);

        res.json({
            tracks: tracks.map(t => ({
                id: t._id,
                title: t.title,
                artist: t.artist,
                genre: t.genre,
                mood: t.mood,
                bpm: t.bpm,
                duration: t.duration,
                tokenPrice: t.tokenPrice,
                rentalDays: t.rentalDays,
                tags: t.tags,
                status: t.active ? 'active' : 'pending',
                totalRentals: t.totalRentals,
                createdAt: t.createdAt
            })),
            pagination: {
                page: pageNum,
                limit: pageSize,
                total,
                pages: Math.ceil(total / pageSize)
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
    }
});

router.put('/tracks/:id', apiKeyAuth, requirePerm('audiobank:update'), async (req, res) => {
    try {
        const { title, artist, genre, mood, bpm, tokenPrice, rentalDays, tags, duration } = req.body;
        const track = await AudioBank.findOne({ _id: req.params.id, submittedByKeyId: req.apiKey._id });
        if (!track) return res.status(404).json({ error: 'Track not found', code: 'NOT_FOUND' });

        if (title) track.title = title;
        if (artist) track.artist = artist;
        if (genre) track.genre = genre;
        if (mood) track.mood = mood;
        if (bpm !== undefined) { const v = parseInt(bpm); if (isNaN(v) || v < 1 || v > 300) return res.status(400).json({ error: 'BPM must be 1-300', code: 'VALIDATION' }); track.bpm = v; }
        if (duration !== undefined) { const v = parseInt(duration); if (isNaN(v) || v < 1 || v > 600) return res.status(400).json({ error: 'Duration must be 1-600 seconds', code: 'VALIDATION' }); track.duration = v; }
        if (tokenPrice !== undefined) { const v = parseInt(tokenPrice); if (isNaN(v) || v < 1) return res.status(400).json({ error: 'Token price must be at least 1', code: 'VALIDATION' }); track.tokenPrice = v; }
        if (rentalDays !== undefined) { const v = parseInt(rentalDays); if (isNaN(v) || v < 1) return res.status(400).json({ error: 'Rental days must be at least 1', code: 'VALIDATION' }); track.rentalDays = v; }
        if (tags) track.tags = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());

        await track.save();
        res.json({ success: true, track: { id: track._id, title: track.title, status: track.active ? 'active' : 'pending' } });
    } catch (error) {
        res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
    }
});

router.delete('/tracks/:id', apiKeyAuth, requirePerm('audiobank:update'), async (req, res) => {
    try {
        const track = await AudioBank.findOne({ _id: req.params.id, submittedByKeyId: req.apiKey._id });
        if (!track) return res.status(404).json({ error: 'Track not found', code: 'NOT_FOUND' });
        track.active = false;
        await track.save();
        res.json({ success: true, message: 'Track deactivated' });
    } catch (error) {
        res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
    }
});

router.get('/admin/tracks', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { status, search, genre, mood } = req.query;
        const query = {};
        if (status === 'active') query.active = true;
        else if (status === 'pending') query.active = false;
        if (genre && genre !== 'all') query.genre = genre;
        if (mood && mood !== 'all') query.mood = mood;
        if (search && search.trim().length >= 2) {
            const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { title: { $regex: term, $options: 'i' } },
                { artist: { $regex: term, $options: 'i' } }
            ];
        }

        const tracks = await AudioBank.find(query).sort({ createdAt: -1 }).limit(100).lean();
        const genres = await AudioBank.distinct('genre');
        const moods = await AudioBank.distinct('mood');
        const counts = {
            total: await AudioBank.countDocuments(),
            active: await AudioBank.countDocuments({ active: true }),
            pending: await AudioBank.countDocuments({ active: false })
        };
        res.json({ tracks, genres, moods, counts });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/admin/tracks/:id/approve', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const track = await AudioBank.findById(req.params.id);
        if (!track) return res.status(404).json({ message: 'Track not found' });
        track.active = true;
        await track.save();
        res.json({ success: true, track });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/admin/tracks/:id/reject', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const track = await AudioBank.findById(req.params.id);
        if (!track) return res.status(404).json({ message: 'Track not found' });
        track.active = false;
        await track.save();
        res.json({ success: true, track });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/admin/tracks/:id/feature', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const track = await AudioBank.findById(req.params.id);
        if (!track) return res.status(404).json({ message: 'Track not found' });
        track.featured = !track.featured;
        await track.save();
        res.json({ success: true, featured: track.featured });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/admin/tracks/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const track = await AudioBank.findById(req.params.id);
        if (!track) return res.status(404).json({ message: 'Track not found' });
        const fields = ['title', 'artist', 'genre', 'mood', 'bpm', 'tokenPrice', 'rentalDays', 'duration', 'tags', 'featured', 'active'];
        fields.forEach(f => {
            if (req.body[f] !== undefined) {
                if (f === 'tags' && typeof req.body[f] === 'string') {
                    track[f] = req.body[f].split(',').map(t => t.trim());
                } else {
                    track[f] = req.body[f];
                }
            }
        });
        await track.save();
        res.json({ success: true, track });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/admin/tracks/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        await AudioBank.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/admin/tracks', auth, requireRole('ADMIN'), upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'preview', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, artist, genre, mood, bpm, tokenPrice, rentalDays, tags, duration } = req.body;
        if (!title) return res.status(400).json({ message: 'Title is required' });
        if (!req.files || !req.files.audio) return res.status(400).json({ message: 'Audio file is required' });

        const { Client } = require('@replit/object-storage');
        const client = new Client();
        const ts = Date.now();

        const audioKey = `audiobank/${ts}-${req.files.audio[0].originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        await client.uploadFromBytes(audioKey, req.files.audio[0].buffer);
        const audioResult = await client.getSignedDownloadUrl(audioKey);
        if (!audioResult.ok) return res.status(500).json({ message: 'Audio upload failed' });

        let previewUrl = '';
        if (req.files.preview) {
            const pk = `audiobank/preview-${ts}-${req.files.preview[0].originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            await client.uploadFromBytes(pk, req.files.preview[0].buffer);
            const pr = await client.getSignedDownloadUrl(pk);
            if (pr.ok) previewUrl = pr.value;
        }

        let coverArt = '';
        if (req.files.cover) {
            const ck = `audiobank/cover-${ts}-${req.files.cover[0].originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            await client.uploadFromBytes(ck, req.files.cover[0].buffer);
            const cr = await client.getSignedDownloadUrl(ck);
            if (cr.ok) coverArt = cr.value;
        }

        const track = await AudioBank.create({
            title,
            artist: artist || 'Wordeth Audio Bank',
            genre: genre || 'general',
            mood: mood || 'chill',
            bpm: bpm ? parseInt(bpm) : 0,
            duration: duration ? parseInt(duration) : 30,
            tokenPrice: parseInt(tokenPrice) || 5,
            rentalDays: rentalDays ? parseInt(rentalDays) : 30,
            tags: tags ? tags.split(',').map(t => t.trim()) : [],
            audioUrl: audioResult.value,
            previewUrl,
            coverArt,
            active: true
        });

        res.status(201).json({ success: true, track });
    } catch (error) {
        console.error('Admin track upload error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/admin/api-keys', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const keys = await ApiKey.find().sort({ createdAt: -1 }).lean();
        res.json({ keys: keys.map(k => ({ ...k, keyHash: undefined })) });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/admin/api-keys', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { name, organization, email, permissions } = req.body;
        if (!name || !organization || !email) return res.status(400).json({ message: 'Name, organization, and email are required' });

        const { key, hash, prefix } = ApiKey.generateKey();
        const apiKey = await ApiKey.create({
            name,
            organization,
            email,
            keyHash: hash,
            keyPrefix: prefix,
            permissions: permissions || ['audiobank:submit', 'audiobank:read']
        });

        res.status(201).json({
            success: true,
            apiKey: {
                id: apiKey._id,
                name: apiKey.name,
                organization: apiKey.organization,
                key: key,
                message: 'Save this key now. It will not be shown again.'
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/admin/api-keys/:id/toggle', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const apiKey = await ApiKey.findById(req.params.id);
        if (!apiKey) return res.status(404).json({ message: 'API key not found' });
        apiKey.active = !apiKey.active;
        await apiKey.save();
        res.json({ success: true, active: apiKey.active });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/admin/api-keys/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        await ApiKey.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
