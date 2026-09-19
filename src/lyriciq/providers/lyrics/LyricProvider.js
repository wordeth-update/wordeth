'use strict';

/**
 * Base contract every lyric provider implements. Gameplay code only ever sees
 * the normalised shapes returned from these methods (see normalizeTrack.js).
 *
 * All methods return Promises. Failures must be thrown as ProviderError with a
 * normalised `code` so callers can react uniformly.
 */
class LyricProvider {
    constructor(name) {
        this.name = name;
    }

    /** @returns {Promise<NormalizedTrack[]>} */
    async searchTracks(/* { query, artist, title, page, pageSize } */) {
        throw new Error(`${this.name}.searchTracks not implemented`);
    }

    /** @returns {Promise<NormalizedTrack>} */
    async getTrack(/* providerTrackId */) {
        throw new Error(`${this.name}.getTrack not implemented`);
    }

    /** @returns {Promise<NormalizedLyricAsset>} (without trackId — the catalog assigns it) */
    async getLyrics(/* providerTrackId */) {
        throw new Error(`${this.name}.getLyrics not implemented`);
    }

    /** Popular tracks for catalog seeding. @returns {Promise<NormalizedTrack[]>} */
    async getPopularTracks(/* { country, page, pageSize } */) {
        return [];
    }

    /**
     * Artists matching a name, for the artist step of setup.
     * @returns {Promise<Array<{ providerArtistId: string, name: string, country?: string, rating?: number }>>}
     */
    async searchArtists(/* { query, pageSize } */) {
        return [];
    }

    /** One artist's tracks with lyrics, for scoping a round. @returns {Promise<NormalizedTrack[]>} */
    async getArtistTracks(/* { providerArtistId, page, pageSize } */) {
        return [];
    }

    /** Same, by artist name, for providers whose ids are unreliable. @returns {Promise<NormalizedTrack[]>} */
    async getArtistTracksByName(/* { name, page, pageSize } */) {
        return [];
    }
}

module.exports = LyricProvider;
