const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const limits = require('../middleware/limits');
const fileStorage = require('../services/fileStorage');

const router = express.Router();

/**
 * A picture for the class board.
 *
 * Board events travel over the room socket, which takes 16KB at most: a
 * stroke, a sign, a place. A picture is uploaded here first and the board
 * carries only its URL, so every phone (and every late arrival) loads the
 * same file once and the room stays light.
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1.5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(new Error('Please upload a JPEG, PNG or WebP image'));
        cb(null, true);
    },
});

router.post('/image', auth, limits.boardImage, (req, res) => {
    upload.single('image')(req, res, async (err) => {
        try {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'That picture is too large for the board (1.5 MB max).' });
                return res.status(415).json({ message: err.message || 'Only images can go on the board.' });
            }
            if (!req.file) return res.status(400).json({ message: 'No picture received.' });
            const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
            const key = `board/${req.user._id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { url } = await fileStorage.uploadBytes(key, req.file.buffer, req.file.mimetype);
            res.json({ url });
        } catch (e) {
            console.error('[Board] image upload failed:', e.message);
            res.status(500).json({ message: 'That picture could not be saved. Try again.' });
        }
    });
});

module.exports = router;
