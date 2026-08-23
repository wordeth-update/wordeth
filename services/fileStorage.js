// MongoDB-backed file storage (GridFS).
// All uploaded files (artwork, audio messages, avatars, photos, snippets,
// audiobank tracks, template previews) live in the app's own MongoDB —
// no dependency on Replit object storage or any external provider.
//
// Files are addressed by a string key (e.g. "avatars/123.png") and served
// through GET /api/files/<key> (see routes/files.js).
const mongoose = require('mongoose');

const BUCKET_NAME = 'uploads';

function getBucket() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected — file storage unavailable');
    }
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
}

// Stable URL a browser can fetch. Encode each path segment, keep slashes.
function publicUrl(key) {
    return '/api/files/' + key.split('/').map(encodeURIComponent).join('/');
}

async function uploadBytes(key, buffer, contentType) {
    const bucket = getBucket();
    // Replace any existing file at this key (e.g. avatar re-upload)
    await deleteByKey(key).catch(() => {});
    return new Promise((resolve, reject) => {
        const stream = bucket.openUploadStream(key, {
            contentType: contentType || 'application/octet-stream'
        });
        stream.on('error', reject);
        stream.on('finish', () => resolve({ key, url: publicUrl(key) }));
        stream.end(buffer);
    });
}

async function findFile(key) {
    const bucket = getBucket();
    const files = await bucket.find({ filename: key }).sort({ uploadDate: -1 }).limit(1).toArray();
    return files[0] || null;
}

// Returns { stream, file } or null if not stored in Mongo.
async function downloadStream(key) {
    const bucket = getBucket();
    const file = await findFile(key);
    if (!file) return null;
    return { stream: bucket.openDownloadStream(file._id), file };
}

// Open a stream by file id with optional { start, end } byte range
// (end is exclusive), for HTTP Range support.
function openStreamById(id, opts = {}) {
    const bucket = getBucket();
    const options = {};
    if (typeof opts.start === 'number') options.start = opts.start;
    if (typeof opts.end === 'number') options.end = opts.end;
    return bucket.openDownloadStream(id, options);
}

async function downloadBytes(key) {
    const result = await downloadStream(key);
    if (!result) return null;
    const chunks = [];
    for await (const chunk of result.stream) chunks.push(chunk);
    return { buffer: Buffer.concat(chunks), file: result.file };
}

async function deleteByKey(key) {
    const bucket = getBucket();
    const files = await bucket.find({ filename: key }).toArray();
    for (const f of files) {
        await bucket.delete(f._id);
    }
    return files.length > 0;
}

module.exports = { uploadBytes, downloadStream, downloadBytes, deleteByKey, findFile, publicUrl, openStreamById };
