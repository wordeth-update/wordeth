const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'uploads', 'audio');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueId = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uniqueId}${ext}`);
    }
});

const audioFilter = (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp3', 'audio/x-m4a', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only audio files are allowed (MP3, WAV, M4A, AAC, OGG, FLAC)'), false);
    }
};

const upload = multer({
    storage,
    fileFilter: audioFilter,
    limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/upload-audio', upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No audio file provided' });
    }

    const fileUrl = `/uploads/audio/${req.file.filename}`;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    res.json({
        url: fileUrl,
        originalName,
        fileSize,
        filename: req.file.filename
    });
});

router.delete('/audio/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    if (!/^[a-f0-9]{16}\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(filename)) {
        return res.status(400).json({ message: 'Invalid filename' });
    }
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ message: 'File deleted' });
    } else {
        res.status(404).json({ message: 'File not found' });
    }
});

setInterval(() => {
    const maxAge = 24 * 60 * 60 * 1000;
    try {
        const files = fs.readdirSync(uploadDir);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(uploadDir, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
            }
        }
    } catch (e) {}
}, 60 * 60 * 1000);

module.exports = router;
