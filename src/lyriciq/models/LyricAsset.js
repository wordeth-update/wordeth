'use strict';

const mongoose = require('mongoose');

/**
 * Normalised lyric content for a track. `lines` is the pre-cleaned, usable
 * line list (provider disclaimers and tracking ids stripped) that the
 * question engine reads. `expiresAt` implements licence-driven cache limits.
 */
const lyricAssetSchema = new mongoose.Schema({
    trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', required: true },
    provider: { type: String, required: true },
    providerLyricId: { type: String, default: null },
    body: { type: String, required: true },
    lines: { type: [String], default: [] },
    language: { type: String, default: 'en' },
    copyright: { type: String, default: '' },
    territoryRestrictions: { type: [String], default: [] },
    explicit: { type: Boolean, default: false },
    provenance: {
        source: { type: String, default: '' },
        fetchedAt: { type: Date, default: Date.now },
        synthetic: { type: Boolean, default: false }
    },
    expiresAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 }
}, { timestamps: true });

lyricAssetSchema.index({ trackId: 1, provider: 1 }, { unique: true });
lyricAssetSchema.index({ expiresAt: 1 });

module.exports = mongoose.models.LyricAsset || mongoose.model('LyricAsset', lyricAssetSchema);
