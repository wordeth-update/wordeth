// Serves files stored in MongoDB (GridFS) at GET /api/files/<key>.
// Legacy fallback: files uploaded before the MongoDB migration live in
// Replit object storage; if a key isn't in Mongo we try there so old
// content keeps working while the app runs on Replit. On other hosts the
// fallback is skipped gracefully (404).
//
// Security notes:
// - Keys for private content include a random token (capability URL),
//   matching the old signed-URL access model.
// - All responses get nosniff + a sandboxing CSP so user-uploaded content
//   (e.g. SVG artwork) can never run scripts when opened directly.
// - Supports HTTP Range requests so audio seeking works.
const express = require('express');
const router = express.Router();
const fileStorage = require('../services/fileStorage');

const MIME_BY_EXT = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
    webm: 'audio/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav',
    m4a: 'audio/mp4', eps: 'application/postscript', ai: 'application/postscript',
    psd: 'image/vnd.adobe.photoshop'
};

function guessType(key) {
    const ext = key.split('.').pop().toLowerCase();
    return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function setSafetyHeaders(res, contentType) {
    res.set('X-Content-Type-Options', 'nosniff');
    // Sandbox blocks script execution if a user navigates directly to an
    // uploaded file (stored-XSS defense for SVG/HTML-ish uploads).
    res.set('Content-Security-Policy', "sandbox; default-src 'none'");
    if (contentType === 'image/svg+xml') {
        res.set('Content-Disposition', 'inline');
    }
}

router.get(/^\/(.+)$/, async (req, res) => {
    const key = decodeURIComponent(req.params[0] || '');
    if (!key || key.includes('..')) {
        return res.status(400).json({ message: 'Invalid file key' });
    }
    try {
        const file = await fileStorage.findFile(key);
        if (file) {
            const contentType = file.contentType || guessType(key);
            const total = file.length;
            setSafetyHeaders(res, contentType);
            res.set('Content-Type', contentType);
            res.set('Accept-Ranges', 'bytes');
            res.set('Cache-Control', 'private, max-age=3600');

            let start = 0;
            let end = total; // exclusive
            let status = 200;
            const range = req.headers.range;
            if (range) {
                const m = range.match(/^bytes=(\d*)-(\d*)$/);
                if (m && (m[1] || m[2])) {
                    if (m[1]) {
                        start = parseInt(m[1]);
                        end = m[2] ? Math.min(parseInt(m[2]) + 1, total) : total;
                    } else {
                        // suffix range: last N bytes
                        start = Math.max(total - parseInt(m[2]), 0);
                        end = total;
                    }
                    if (start >= total || start >= end) {
                        res.set('Content-Range', `bytes */${total}`);
                        return res.status(416).end();
                    }
                    status = 206;
                    res.set('Content-Range', `bytes ${start}-${end - 1}/${total}`);
                }
            }
            res.status(status);
            res.set('Content-Length', String(end - start));
            const stream = fileStorage.openStreamById(file._id, { start, end });
            stream.on('error', (err) => {
                console.error('[Files] stream error:', err.message);
                if (!res.headersSent) res.status(500).end();
                else res.destroy();
            });
            return stream.pipe(res);
        }
        // Legacy fallback: Replit object storage (only works inside Replit)
        try {
            const { Client } = require('@replit/object-storage');
            const legacy = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
                ? new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID })
                : new Client();
            const dl = await legacy.downloadAsBytes(key);
            const bytes = dl && dl.ok ? dl.value : (Buffer.isBuffer(dl) ? dl : null);
            if (bytes) {
                const buf = Array.isArray(bytes) ? bytes[0] : bytes;
                const contentType = guessType(key);
                setSafetyHeaders(res, contentType);
                res.set('Content-Type', contentType);
                res.set('Cache-Control', 'private, max-age=3600');
                return res.send(buf);
            }
        } catch (e) { /* not on Replit or object missing */ }
        res.status(404).json({ message: 'File not found' });
    } catch (err) {
        console.error('[Files] serve error:', err.message);
        res.status(500).json({ message: 'Failed to load file' });
    }
});

module.exports = router;
