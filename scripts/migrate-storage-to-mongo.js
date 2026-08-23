// One-time migration: copy every file from Replit object storage into
// MongoDB (GridFS), then rewrite stored signed URLs in Mongo documents to
// stable /api/files/<key> URLs. Idempotent: safe to re-run (skips files
// already in GridFS, only rewrites URLs still pointing at old storage).
//
// MUST run inside Replit (the only place the legacy storage is reachable):
//   node scripts/migrate-storage-to-mongo.js
require('dotenv').config();
const mongoose = require('mongoose');

function extractKeyFromSignedUrl(url) {
    // Signed URLs look like https://storage.googleapis.com/<bucket>/<key>?X-Goog-...
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        return decodeURIComponent(parts.slice(1).join('/'));
    } catch { return null; }
}

async function main() {
    const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@wrdthcluster.3kkpz37.mongodb.net/wordeth?retryWrites=true&w=majority&appName=WrdthCluster`;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('Connected to MongoDB');

    const fileStorage = require('../services/fileStorage');
    const { Client } = require('@replit/object-storage');
    const legacy = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
        ? new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID })
        : new Client();

    // 1) Copy all objects into GridFS
    const listRes = await legacy.list();
    const objects = listRes.ok ? listRes.value : [];
    console.log(`Found ${objects.length} objects in legacy storage`);
    let copied = 0, skipped = 0, failed = 0;
    for (const obj of objects) {
        const key = obj.name;
        try {
            if (await fileStorage.findFile(key)) { skipped++; continue; }
            const dl = await legacy.downloadAsBytes(key);
            if (!dl.ok) { console.warn(`  download failed: ${key}`); failed++; continue; }
            const buf = Array.isArray(dl.value) ? dl.value[0] : dl.value;
            await fileStorage.uploadBytes(key, Buffer.from(buf), undefined);
            copied++;
            if (copied % 25 === 0) console.log(`  copied ${copied}...`);
        } catch (e) {
            console.warn(`  error on ${key}: ${e.message}`);
            failed++;
        }
    }
    console.log(`Copy done: ${copied} copied, ${skipped} already in Mongo, ${failed} failed`);

    // 2) Rewrite stored URLs that still point at old storage
    const looksLegacy = (u) => typeof u === 'string' && /^https?:\/\//.test(u) && !u.includes('/api/files/');
    const toNew = (u) => {
        const key = extractKeyFromSignedUrl(u);
        return key ? fileStorage.publicUrl(key) : null;
    };

    const User = require('../models/User');
    const AudioBank = require('../models/AudioBank');
    const DesignTemplate = require('../models/DesignTemplate');

    let rewrites = 0;

    const users = await User.find({
        $or: [
            { 'profilePhotos.url': { $regex: '^http' } },
            { 'musicSnippet.url': { $regex: '^http' } }
        ]
    });
    for (const user of users) {
        let changed = false;
        for (const photo of user.profilePhotos || []) {
            if (looksLegacy(photo.url)) {
                const nu = toNew(photo.url);
                if (nu) { photo.url = nu; changed = true; rewrites++; }
            }
        }
        if (user.musicSnippet && looksLegacy(user.musicSnippet.url)) {
            const nu = toNew(user.musicSnippet.url);
            if (nu) { user.musicSnippet.url = nu; changed = true; rewrites++; }
        }
        if (changed) await user.save();
    }

    const tracks = await AudioBank.find({
        $or: [
            { audioUrl: { $regex: '^http' } },
            { previewUrl: { $regex: '^http' } },
            { coverArt: { $regex: '^http' } }
        ]
    });
    for (const t of tracks) {
        let changed = false;
        for (const field of ['audioUrl', 'previewUrl', 'coverArt']) {
            if (looksLegacy(t[field])) {
                const nu = toNew(t[field]);
                if (nu) { t[field] = nu; changed = true; rewrites++; }
            }
        }
        if (changed) await t.save();
    }

    // Template previews stored '/object-storage/<key>' when public paths were set
    const templates = await DesignTemplate.find({ previewImageUrl: { $regex: '^/object-storage/' } });
    for (const tpl of templates) {
        const key = tpl.previewImageUrl.replace(/^\/object-storage\//, '');
        tpl.previewImageUrl = fileStorage.publicUrl(key);
        rewrites++;
        await tpl.save();
    }

    // Label artwork URLs are recomputed from objectPath at read time, but
    // refresh the stored copy too for consistency.
    const Label = require('../models/Label');
    const labels = await Label.find({ 'artists.templateArtwork.0': { $exists: true } });
    for (const label of labels) {
        let changed = false;
        for (const artist of label.artists) {
            for (const art of artist.templateArtwork || []) {
                if (art.objectPath && looksLegacy(art.url)) {
                    art.url = fileStorage.publicUrl(art.objectPath);
                    changed = true; rewrites++;
                }
            }
        }
        if (changed) await label.save();
    }

    console.log(`URL rewrites: ${rewrites}`);
    console.log('Migration complete.');
    await mongoose.disconnect();
}

main().catch(e => { console.error('MIGRATION FAILED:', e); process.exit(1); });
