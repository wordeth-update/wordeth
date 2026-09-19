'use strict';

const { slugify } = require('../../providers/lyrics/normalizeTrack');
const config = require('../../config');

/**
 * Centralised gameplay eligibility. Pure: takes a track, a context and a
 * restriction snapshot, returns { eligible, reason }.
 *
 * context = { gameMode, territory, allowExplicit, genre }
 * restrictions = output of restrictionService.snapshot()
 */
function isTrackEligibleForGame(track, context = {}, restrictions = emptyRestrictions()) {
    if (!track) return reject('NO_TRACK');
    if (track.status && track.status !== 'ACTIVE') return reject('TRACK_DISABLED');
    if (!track.hasLyrics) return reject('NO_LYRICS');
    if (track.instrumental) return reject('INSTRUMENTAL');
    if (track.synthetic && context.allowSynthetic === false) return reject('SYNTHETIC_NOT_ALLOWED');

    const allowedLanguages = context.allowedLanguages || config.provider.allowedLanguages;
    if (track.language && allowedLanguages.length && !allowedLanguages.includes(String(track.language).toLowerCase())) return reject('LANGUAGE_NOT_ALLOWED');

    const mode = context.gameMode || null;
    const appliesTo = (r) => !r.gameModes?.length || !mode || r.gameModes.includes(mode);

    if (mode && restrictions.gameModes.has(mode)) return reject('GAME_MODE_DISABLED');

    const trackRule = restrictions.tracks.get(String(track._id || track.id || ''));
    if (trackRule && appliesTo(trackRule)) return reject('TRACK_RESTRICTED');

    const artistKey = track.artistKey || slugify(track.artist);
    const artistRule = restrictions.artists.get(artistKey);
    if (artistRule && appliesTo(artistRule)) return reject('ARTIST_RESTRICTED');

    if (track.album) {
        const albumRule = restrictions.albums.get(slugify(track.album));
        if (albumRule && appliesTo(albumRule)) return reject('ALBUM_RESTRICTED');
    }

    const providerRule = restrictions.providers.get(String(track.provider || '').toLowerCase());
    if (providerRule && appliesTo(providerRule)) return reject('PROVIDER_RESTRICTED');

    if (context.territory) {
        const territoryRule = restrictions.territories.get(String(context.territory).toUpperCase());
        if (territoryRule && appliesTo(territoryRule)) return reject('TERRITORY_RESTRICTED');
    }

    if (track.explicit) {
        const explicitRule = restrictions.explicit;
        if (explicitRule && appliesTo(explicitRule)) return reject('EXPLICIT_RESTRICTED');
        if (context.allowExplicit === false) return reject('EXPLICIT_NOT_ALLOWED');
    }

    if (context.genre && context.genre !== 'all' && track.primaryGenre !== context.genre) return reject('GENRE_MISMATCH');
    if (context.artistKey && track.artistKey !== context.artistKey) return reject('ARTIST_MISMATCH');

    return { eligible: true, reason: null };
}

function reject(reason) {
    return { eligible: false, reason };
}

function emptyRestrictions() {
    return {
        tracks: new Map(),
        artists: new Map(),
        albums: new Map(),
        providers: new Map(),
        territories: new Map(),
        gameModes: new Map(),
        explicit: null
    };
}

/** Build the lookup snapshot from ContentRestriction documents. */
function buildRestrictionSnapshot(docs) {
    const snap = emptyRestrictions();
    for (const doc of docs || []) {
        if (doc.active === false) continue;
        const rule = { gameModes: doc.gameModes || [], reason: doc.reason || '' };
        const value = String(doc.value);
        switch (doc.type) {
            case 'TRACK': snap.tracks.set(value, rule); break;
            case 'ARTIST': snap.artists.set(slugify(value), rule); break;
            case 'ALBUM': snap.albums.set(slugify(value), rule); break;
            case 'PROVIDER': snap.providers.set(value.toLowerCase(), rule); break;
            case 'TERRITORY': snap.territories.set(value.toUpperCase(), rule); break;
            case 'GAME_MODE': snap.gameModes.set(value, rule); break;
            case 'EXPLICIT': if (['true', '1', 'yes'].includes(value.toLowerCase())) snap.explicit = rule; break;
            default: break;
        }
    }
    return snap;
}

module.exports = { isTrackEligibleForGame, buildRestrictionSnapshot, emptyRestrictions };
