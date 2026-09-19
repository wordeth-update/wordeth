'use strict';

const mongoose = require('mongoose');

/**
 * Normalised track. Gameplay never touches raw provider objects — everything
 * the engines need is on this document, provider specifics live in
 * `providerMetadata`.
 */
const trackSchema = new mongoose.Schema({
    provider: { type: String, required: true, index: true },
    providerTrackId: { type: String, required: true },
    isrc: { type: String, default: null },
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    artistKey: { type: String, required: true, index: true },
    providerArtistId: { type: String, default: null },
    album: { type: String, default: '' },
    providerAlbumId: { type: String, default: null },
    artwork: { type: String, default: null },
    genres: { type: [String], default: [] },
    primaryGenre: { type: String, default: 'other', index: true },
    releaseYear: { type: Number, default: null },
    decade: { type: String, default: null, index: true },
    language: { type: String, default: 'en' },
    explicit: { type: Boolean, default: false },
    instrumental: { type: Boolean, default: false },
    hasLyrics: { type: Boolean, default: false },
    hasSubtitles: { type: Boolean, default: false },
    hasRichSync: { type: Boolean, default: false },
    popularity: { type: Number, default: 50, min: 0, max: 100 },
    copyright: { type: String, default: '' },
    providerMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    synthetic: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true },
    disabledReason: { type: String, default: '' },
    schemaVersion: { type: Number, default: 1 }
}, { timestamps: true });

trackSchema.index({ provider: 1, providerTrackId: 1 }, { unique: true });
trackSchema.index({ status: 1, hasLyrics: 1, primaryGenre: 1 });

/** Public metadata that may be sent to the client (before or after an answer). */
trackSchema.methods.toPublicMetadata = function toPublicMetadata() {
    return {
        id: String(this._id),
        title: this.title,
        artist: this.artist,
        album: this.album || '',
        artwork: this.artwork || null,
        genre: this.primaryGenre,
        decade: this.decade,
        releaseYear: this.releaseYear,
        synthetic: !!this.synthetic
    };
};

module.exports = mongoose.models.Track || mongoose.model('Track', trackSchema);
