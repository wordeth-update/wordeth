'use strict';

const axios = require('axios');
const LyricProvider = require('./LyricProvider');
const { finalizeTrack, finalizeLyricAsset } = require('./normalizeTrack');
const { slugify } = require('./normalizeTrack');
const { ProviderError } = require('../../utilities/errors');
const config = require('../../config');
const logger = require('../../utilities/logger');

/**
 * Musixmatch adapter. Converts raw Musixmatch payloads into NormalizedTrack /
 * NormalizedLyricAsset and maps every failure mode onto ProviderError codes.
 *
 * The HTTP client is injectable so tests never touch the network.
 */
class MusixmatchProvider extends LyricProvider {
    constructor({ apiKey = config.provider.musixmatch.apiKey, baseUrl = config.provider.musixmatch.baseUrl, timeoutMs = config.provider.musixmatch.timeoutMs, http = null } = {}) {
        super('musixmatch');
        if (!apiKey) throw new Error('MusixmatchProvider requires an API key');
        this.apiKey = apiKey;
        this.http = http || axios.create({ baseURL: baseUrl, timeout: timeoutMs });
    }

    async _call(endpoint, params) {
        let response;
        try {
            response = await this.http.get(`/${endpoint}`, { params: { apikey: this.apiKey, ...params } });
        } catch (err) {
            throw this._mapTransportError(err);
        }
        const header = response?.data?.message?.header;
        const body = response?.data?.message?.body;
        if (!header || typeof header.status_code !== 'number') {
            throw new ProviderError('BAD_PAYLOAD', 'Musixmatch returned an unexpected payload', { provider: this.name });
        }
        if (header.status_code !== 200) {
            throw this._mapStatus(header.status_code, endpoint);
        }
        return body;
    }

    _mapTransportError(err) {
        if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message || '')) {
            return new ProviderError('TIMEOUT', 'Musixmatch request timed out', { provider: this.name, retryable: true, cause: err });
        }
        const status = err.response?.status;
        if (status === 429) return new ProviderError('RATE_LIMITED', 'Musixmatch rate limit reached', { provider: this.name, retryable: true, cause: err });
        if (status === 401 || status === 403) return new ProviderError('UNAUTHORIZED', 'Musixmatch rejected the API key', { provider: this.name, cause: err });
        if (status === 404) return new ProviderError('NOT_FOUND', 'Musixmatch resource not found', { provider: this.name, cause: err });
        return new ProviderError('UNAVAILABLE', 'Musixmatch unavailable', { provider: this.name, retryable: true, cause: err });
    }

    _mapStatus(code, endpoint) {
        switch (code) {
            case 401: return new ProviderError('UNAUTHORIZED', 'Musixmatch rejected the API key', { provider: this.name });
            case 402: return new ProviderError('RATE_LIMITED', 'Musixmatch usage limit reached', { provider: this.name, retryable: true });
            case 403: return new ProviderError('RESTRICTED', 'Musixmatch content is restricted for this plan or territory', { provider: this.name });
            case 404: return new ProviderError('NOT_FOUND', `Musixmatch ${endpoint} returned no result`, { provider: this.name });
            case 429: return new ProviderError('RATE_LIMITED', 'Musixmatch rate limit reached', { provider: this.name, retryable: true });
            default: return new ProviderError('UNAVAILABLE', `Musixmatch returned status ${code}`, { provider: this.name, retryable: code >= 500 });
        }
    }

    _normalizeTrack(raw) {
        if (!raw || raw.track_id === undefined) {
            throw new ProviderError('BAD_PAYLOAD', 'Musixmatch track payload missing track_id', { provider: this.name });
        }
        const genres = raw.primary_genres?.music_genre_list?.map((g) => g.music_genre?.music_genre_name).filter(Boolean) || [];
        return finalizeTrack({
            provider: this.name,
            providerTrackId: raw.track_id,
            isrc: raw.track_isrc || null,
            title: raw.track_name,
            artist: raw.artist_name,
            providerArtistId: raw.artist_id,
            album: raw.album_name,
            providerAlbumId: raw.album_id,
            artwork: [raw.album_coverart_800x800, raw.album_coverart_500x500, raw.album_coverart_350x350, raw.album_coverart_100x100]
                .find((u) => u && !/nocover/i.test(u)) || null,
            genres,
            releaseDate: raw.first_release_date,
            explicit: raw.explicit === 1,
            instrumental: raw.instrumental === 1,
            hasLyrics: raw.has_lyrics === 1,
            hasSubtitles: raw.has_subtitles === 1,
            hasRichSync: raw.has_richsync === 1,
            popularity: raw.track_rating,
            copyright: '',
            providerMetadata: {
                shareUrl: raw.track_share_url || null,
                commontrackId: raw.commontrack_id || null,
                numFavourite: raw.num_favourite || 0,
                restricted: raw.restricted === 1
            }
        });
    }

    async searchTracks({ query = '', artist = '', title = '', page = 1, pageSize = 25 } = {}) {
        const params = { f_has_lyrics: 1, page, page_size: pageSize, s_track_rating: 'desc' };
        if (artist) params.q_artist = artist;
        if (title) params.q_track = title;
        if (query) params.q_track_artist = query;
        const body = await this._call('track.search', params);
        const list = body?.track_list;
        if (!Array.isArray(list)) throw new ProviderError('BAD_PAYLOAD', 'Musixmatch search payload missing track_list', { provider: this.name });
        return list.map((item) => this._normalizeTrack(item.track));
    }

    async getTrack(providerTrackId) {
        const body = await this._call('track.get', { track_id: providerTrackId });
        return this._normalizeTrack(body?.track);
    }

    async getLyrics(providerTrackId) {
        const body = await this._call('track.lyrics.get', { track_id: providerTrackId });
        const lyrics = body?.lyrics;
        if (!lyrics || typeof lyrics.lyrics_body !== 'string') {
            throw new ProviderError('BAD_PAYLOAD', 'Musixmatch lyrics payload malformed', { provider: this.name });
        }
        if (lyrics.restricted === 1) {
            throw new ProviderError('RESTRICTED', 'Lyrics restricted by Musixmatch', { provider: this.name });
        }
        if (lyrics.instrumental === 1) {
            throw new ProviderError('RESTRICTED', 'Track is instrumental', { provider: this.name });
        }
        if (!lyrics.lyrics_body.trim()) {
            throw new ProviderError('NOT_FOUND', 'Lyrics body empty', { provider: this.name });
        }
        return finalizeLyricAsset({
            provider: this.name,
            providerLyricId: lyrics.lyrics_id,
            body: lyrics.lyrics_body,
            language: lyrics.lyrics_language || 'en',
            copyright: lyrics.lyrics_copyright || '',
            explicit: lyrics.explicit === 1,
            territoryRestrictions: [],
            provenance: { source: 'musixmatch:track.lyrics.get', fetchedAt: new Date() }
        });
    }

    /**
     * Top-rated tracks in one Wordeth genre via track.search + f_music_genre_id.
     * Musixmatch genre tags are often missing on chart rows, so tracks found this
     * way take the requested genre when their own tags do not map to one.
     */
    async getGenreTracks({ genre, page = 1, pageSize = config.provider.musixmatch.seedPageSize, language = null } = {}) {
        const genreId = config.provider.musixmatch.genreIds[genre];
        if (!genreId) throw new ProviderError('BAD_REQUEST', `No Musixmatch genre id for "${genre}"`, { provider: this.name });
        const params = { f_music_genre_id: genreId, f_has_lyrics: 1, s_track_rating: 'desc', page, page_size: pageSize };
        const lang = language || (config.provider.allowedLanguages.length === 1 ? config.provider.allowedLanguages[0] : null);
        if (lang) params.f_lyrics_language = lang;
        const body = await this._call('track.search', params);
        const list = body?.track_list;
        if (!Array.isArray(list)) throw new ProviderError('BAD_PAYLOAD', 'Musixmatch genre search payload missing track_list', { provider: this.name });
        logger.debug('provider_genre_fetched', { provider: this.name, count: list.length, genre, page });
        return list.map((item) => {
            const t = this._normalizeTrack(item.track);
            if (t.primaryGenre === 'other') t.primaryGenre = genre;
            return t;
        });
    }

    /** artist.search: the artist step's picker. */
    async searchArtists({ query = '', pageSize = 10 } = {}) {
        const q = String(query || '').trim();
        if (!q) return [];
        // Musixmatch returns every credit that matches, including features and empty
        // duplicates, in no useful order. Keep one entry per name, the best rated,
        // and never a "feat." credit: those are not artists a player would pick.
        const body = await this._call('artist.search', { q_artist: q, page: 1, page_size: Math.max(pageSize * 3, 20) });
        const list = body?.artist_list;
        if (!Array.isArray(list)) throw new ProviderError('BAD_PAYLOAD', 'Musixmatch artist search payload missing artist_list', { provider: this.name });
        const byKey = new Map();
        for (const item of list) {
            const a = item && item.artist;
            if (!a || a.artist_id === undefined || !a.artist_name) continue;
            const name = String(a.artist_name).trim();
            if (/\b(feat|ft)\.?\s|\bfeaturing\b/i.test(name)) continue;
            const key = slugify(name);
            const entry = { providerArtistId: String(a.artist_id), name, country: a.artist_country || null, rating: Number(a.artist_rating) || 0 };
            const seen = byKey.get(key);
            if (!seen || entry.rating > seen.rating) byKey.set(key, entry);
        }
        const exact = slugify(q);
        return Array.from(byKey.values())
            .sort((a, b) => (Number(slugify(b.name) === exact) - Number(slugify(a.name) === exact)) || b.rating - a.rating)
            .slice(0, pageSize);
    }

    /** track.search by artist name: the fallback when an artist id turns up nothing. */
    async getArtistTracksByName({ name, page = 1, pageSize = config.provider.musixmatch.seedPageSize } = {}) {
        const q = String(name || '').trim();
        if (!q) throw new ProviderError('BAD_REQUEST', 'name is required', { provider: this.name });
        const params = { q_artist: q, f_has_lyrics: 1, s_track_rating: 'desc', page, page_size: pageSize };
        const body = await this._call('track.search', params);
        const list = body?.track_list;
        if (!Array.isArray(list)) throw new ProviderError('BAD_PAYLOAD', 'Musixmatch artist name search payload missing track_list', { provider: this.name });
        return list.map((item) => this._normalizeTrack(item.track));
    }

    /** track.search + f_artist_id: everything with lyrics by one artist, best rated first. */
    async getArtistTracks({ providerArtistId, page = 1, pageSize = config.provider.musixmatch.seedPageSize } = {}) {
        if (!providerArtistId) throw new ProviderError('BAD_REQUEST', 'providerArtistId is required', { provider: this.name });
        const params = { f_artist_id: String(providerArtistId), f_has_lyrics: 1, s_track_rating: 'desc', page, page_size: pageSize };
        const body = await this._call('track.search', params);
        const list = body?.track_list;
        if (!Array.isArray(list)) throw new ProviderError('BAD_PAYLOAD', 'Musixmatch artist tracks payload missing track_list', { provider: this.name });
        logger.debug('provider_artist_fetched', { provider: this.name, count: list.length, providerArtistId, page });
        return list.map((item) => this._normalizeTrack(item.track));
    }

    async getPopularTracks({ country = 'us', page = 1, pageSize = config.provider.musixmatch.seedPageSize, chart = 'top' } = {}) {
        const body = await this._call('chart.tracks.get', { country, page, page_size: pageSize, chart_name: chart, f_has_lyrics: 1 });
        const list = body?.track_list;
        if (!Array.isArray(list)) throw new ProviderError('BAD_PAYLOAD', 'Musixmatch chart payload missing track_list', { provider: this.name });
        logger.debug('provider_chart_fetched', { provider: this.name, count: list.length, country, chart });
        return list.map((item) => this._normalizeTrack(item.track));
    }
}

module.exports = MusixmatchProvider;
