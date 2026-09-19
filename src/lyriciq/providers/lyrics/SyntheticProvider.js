'use strict';

const LyricProvider = require('./LyricProvider');
const { finalizeTrack, finalizeLyricAsset } = require('./normalizeTrack');
const { ProviderError } = require('../../utilities/errors');
const catalog = require('../../fixtures/syntheticCatalog');

/**
 * Provider backed by the fabricated fixture catalog. Used for development,
 * automated tests and as an explicit opt-in fallback. Mirrors the provider
 * contract exactly so engines cannot tell the difference.
 */
class SyntheticProvider extends LyricProvider {
    constructor({ tracks = catalog.tracks } = {}) {
        super('synthetic');
        this.entries = tracks;
    }

    _find(id) {
        const entry = this.entries.find((t) => t.providerTrackId === String(id));
        if (!entry) throw new ProviderError('NOT_FOUND', `Synthetic track ${id} not found`, { provider: this.name });
        return entry;
    }

    async searchTracks({ query = '', artist = '', title = '', pageSize = 25 } = {}) {
        const q = String(query || `${artist} ${title}`).toLowerCase().trim();
        const hits = this.entries.filter((t) => !q || `${t.artist} ${t.title}`.toLowerCase().includes(q));
        return hits.slice(0, pageSize).map((e) => finalizeTrack(catalog.buildSyntheticTrack(e)));
    }

    async getTrack(providerTrackId) {
        return finalizeTrack(catalog.buildSyntheticTrack(this._find(providerTrackId)));
    }

    async getLyrics(providerTrackId) {
        return finalizeLyricAsset(catalog.buildSyntheticLyric(this._find(providerTrackId)));
    }

    async getPopularTracks({ pageSize = 50 } = {}) {
        return this.entries
            .slice()
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, pageSize)
            .map((e) => finalizeTrack(catalog.buildSyntheticTrack(e)));
    }
}

module.exports = SyntheticProvider;
