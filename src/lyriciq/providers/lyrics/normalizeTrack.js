'use strict';

/**
 * Normalisation helpers shared by providers. Produces the Wordeth internal
 * representations (NormalizedTrack / NormalizedLyricAsset).
 */

const GENRE_MAP = [
    { test: /hip[\s-]?hop|rap|trap|drill|grime/i, slug: 'hiphop' },
    { test: /r&b|rnb|soul|neo[\s-]?soul|urban/i, slug: 'rnb' },
    { test: /country|americana|bluegrass/i, slug: 'country' },
    { test: /rock|metal|punk|grunge|alternative|indie|emo/i, slug: 'rock' },
    { test: /pop|dance|electro|synth|k-pop|teen/i, slug: 'pop' }
];

function normalizeGenre(genres) {
    const list = Array.isArray(genres) ? genres : [genres];
    for (const g of list) {
        if (!g) continue;
        for (const { test, slug } of GENRE_MAP) {
            if (test.test(String(g))) return slug;
        }
    }
    return 'other';
}

function slugify(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'unknown';
}

function decadeOf(year) {
    if (!year || !Number.isFinite(Number(year))) return null;
    return `${Math.floor(Number(year) / 10) * 10}s`;
}

function yearFrom(dateLike) {
    if (!dateLike) return null;
    const m = String(dateLike).match(/^(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
}

/** Ensure a track object has every derived field the engines depend on. */
function finalizeTrack(partial) {
    const releaseYear = partial.releaseYear ?? yearFrom(partial.releaseDate);
    return {
        provider: partial.provider,
        providerTrackId: String(partial.providerTrackId),
        isrc: partial.isrc || null,
        title: partial.title,
        artist: partial.artist,
        artistKey: partial.artistKey || slugify(partial.artist),
        providerArtistId: partial.providerArtistId ? String(partial.providerArtistId) : null,
        album: partial.album || '',
        providerAlbumId: partial.providerAlbumId ? String(partial.providerAlbumId) : null,
        artwork: partial.artwork || null,
        genres: partial.genres || [],
        primaryGenre: partial.primaryGenre || normalizeGenre(partial.genres || []),
        releaseYear,
        decade: decadeOf(releaseYear),
        language: partial.language || 'en',
        explicit: !!partial.explicit,
        instrumental: !!partial.instrumental,
        hasLyrics: !!partial.hasLyrics,
        hasSubtitles: !!partial.hasSubtitles,
        hasRichSync: !!partial.hasRichSync,
        popularity: clampPopularity(partial.popularity),
        copyright: partial.copyright || '',
        providerMetadata: partial.providerMetadata || {},
        synthetic: !!partial.synthetic
    };
}

function clampPopularity(p) {
    const n = Number(p);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
}

const PROVIDER_NOISE_PATTERNS = [
    /^\*+.*\*+$/,                    // ******* disclaimer *******
    /this lyrics is not for commercial use/i,
    /^\(\d{6,}\)$/,                  // (1409623321456) tracking ids
    /^\[.*\]$/,                      // [Chorus], [Verse 2]
    /^\.{3}$/,                       // truncated body marker
    /^…$/
];

/** Split a raw lyric body into clean, usable lines. */
function extractUsableLines(body) {
    if (!body) return [];
    return String(body)
        .replace(/\r/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .filter((l) => !PROVIDER_NOISE_PATTERNS.some((p) => p.test(l)))
        .map((l) => l.replace(/\s+/g, ' '));
}

function finalizeLyricAsset(partial) {
    const body = String(partial.body || '');
    return {
        provider: partial.provider,
        providerLyricId: partial.providerLyricId ? String(partial.providerLyricId) : null,
        body,
        lines: partial.lines || extractUsableLines(body),
        language: partial.language || 'en',
        copyright: partial.copyright || '',
        territoryRestrictions: partial.territoryRestrictions || [],
        explicit: !!partial.explicit,
        provenance: {
            source: partial.provenance?.source || partial.provider,
            fetchedAt: partial.provenance?.fetchedAt || new Date(),
            synthetic: !!partial.provenance?.synthetic
        }
    };
}

module.exports = { normalizeGenre, slugify, decadeOf, yearFrom, finalizeTrack, finalizeLyricAsset, extractUsableLines };
