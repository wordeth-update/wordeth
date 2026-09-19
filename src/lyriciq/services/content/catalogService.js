'use strict';

const mongoose = require('mongoose');
const Track = require('../../models/Track');
const LyricAsset = require('../../models/LyricAsset');
const config = require('../../config');
const logger = require('../../utilities/logger');
const { cache } = require('./providerCache');
const { getLyricProvider, getSyntheticProvider } = require('../../providers/lyrics');
const { isTrackEligibleForGame } = require('./eligibility');
const restrictionService = require('./restrictionService');
const { slugify, leadArtistKey } = require('../../providers/lyrics/normalizeTrack');
const { ProviderError } = require('../../utilities/errors');
const syntheticCatalog = require('../../fixtures/syntheticCatalog');

/**
 * Catalog service: the only place that talks to lyric providers on behalf of
 * gameplay. Tracks are persisted as normalised documents; lyric bodies are
 * cached per the configured TTL and refetched when expired.
 */

function providerFor(track) {
    return track.provider === 'synthetic' ? getSyntheticProvider() : getLyricProvider();
}

/** Upsert a normalised track. Returns the Track document. */
async function upsertTrack(normalized) {
    const { provider, providerTrackId, ...rest } = normalized;
    return Track.findOneAndUpdate(
        { provider, providerTrackId: String(providerTrackId) },
        { $set: rest, $setOnInsert: { provider, providerTrackId: String(providerTrackId), status: 'ACTIVE' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

/** Seed the synthetic catalog into the database (idempotent). */
async function seedSyntheticCatalog() {
    const provider = getSyntheticProvider();
    const tracks = await provider.getPopularTracks({ pageSize: 1000 });
    let count = 0;
    for (const t of tracks) {
        const doc = await upsertTrack(t);
        const lyric = await provider.getLyrics(t.providerTrackId);
        await LyricAsset.findOneAndUpdate(
            { trackId: doc._id, provider: 'synthetic' },
            { $set: { ...lyric, trackId: doc._id, expiresAt: null } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        count++;
    }
    cache.clear('trackMetadata');
    logger.info('catalog_synthetic_seeded', { count, marker: syntheticCatalog.SYNTHETIC_MARKER });
    return count;
}

const GENRES = Object.keys(config.provider.musixmatch.genreIds);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull tracks from the licensed provider into the catalog: the country chart,
 * the top of each requested genre, and any free-text queries. Lyric bodies are
 * not fetched here; `warmLyrics` (or first play) does that.
 */
async function seedFromProvider({ queries = [], chart = true, country = 'us', pages = 1, pageSize, genres = [], genrePages = 1 } = {}) {
    const provider = getLyricProvider();
    if (provider.name === 'synthetic') return seedSyntheticCatalog();
    const seen = new Set();
    let inserted = 0;
    const handle = async (tracks) => {
        for (const t of tracks) {
            const key = `${t.provider}:${t.providerTrackId}`;
            if (seen.has(key) || !t.hasLyrics || t.instrumental) continue;
            seen.add(key);
            await upsertTrack(t);
            inserted++;
        }
    };
    try {
        if (chart) {
            for (let page = 1; page <= pages; page++) {
                await handle(await provider.getPopularTracks({ country, page, pageSize }));
            }
        }
        if (genres.length && typeof provider.getGenreTracks === 'function') {
            for (const genre of genres) {
                for (let page = 1; page <= genrePages; page++) {
                    await handle(await provider.getGenreTracks({ genre, page, pageSize }));
                }
            }
        }
        for (const q of queries) {
            await handle(await provider.searchTracks({ query: q, pageSize }));
        }
    } catch (err) {
        logger.error('provider_error', { provider: provider.name, code: err.code, message: err.message, phase: 'seed' });
        if (!(err instanceof ProviderError)) throw err;
    }
    cache.clear('trackMetadata');
    logger.info('catalog_seeded', { provider: provider.name, inserted, genres });
    return inserted;
}

/**
 * Fetch lyric bodies ahead of play for licensed tracks whose stored asset is
 * missing or expired, most popular first, so the first question on a track
 * never waits on the provider. Stops early when the provider pushes back.
 */
async function warmLyrics({ limit = config.catalog.warmLyricsPerRun, delayMs = config.catalog.warmDelayMs } = {}) {
    const result = { checked: 0, warmed: 0, disabled: 0, failed: 0, stopped: null };
    if (limit <= 0) return result;
    const now = new Date();
    const tracks = await Track.find({ synthetic: false, status: 'ACTIVE', hasLyrics: true, instrumental: false }).sort({ popularity: -1 }).lean();
    const fresh = new Set((await LyricAsset.find({ trackId: { $in: tracks.map((t) => t._id) }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }).select('trackId').lean()).map((a) => String(a.trackId)));
    for (const track of tracks) {
        if (result.warmed + result.disabled + result.failed >= limit) break;
        if (fresh.has(String(track._id))) continue;
        result.checked++;
        try {
            // Warming is about what is stored under licence, so the in-process copy is not consulted.
            await getLyricAsset(track, { bypassMemory: true });
            const after = await Track.findById(track._id).select('status').lean();
            if (after && after.status !== 'ACTIVE') result.disabled++; else result.warmed++;
        } catch (err) {
            if (err instanceof ProviderError && ['RATE_LIMITED', 'UNAUTHORIZED', 'TIMEOUT', 'UNAVAILABLE'].includes(err.code)) { result.stopped = err.code; break; }
            if (err instanceof ProviderError && ['RESTRICTED', 'NOT_FOUND'].includes(err.code)) result.disabled++; else result.failed++;
        }
        if (delayMs) await sleep(delayMs);
    }
    logger.info('catalog_lyrics_warmed', result);
    return result;
}

let refreshing = null;
/** Full upkeep pass: chart + every genre, then warm lyrics. Serialised; concurrent callers share the run. */
function refreshCatalog(opts = {}) {
    if (refreshing) return refreshing;
    refreshing = (async () => {
        const startedAt = Date.now();
        const provider = getLyricProvider();
        if (provider.name === 'synthetic') return { synthetic: await seedSyntheticCatalog(), ms: Date.now() - startedAt };
        const inserted = await seedFromProvider({
            chart: true,
            pages: opts.chartPages ?? config.catalog.chartPages,
            country: opts.country || 'us',
            genres: opts.genres || GENRES,
            genrePages: opts.genrePages ?? config.catalog.genrePages
        });
        const warm = await warmLyrics({ limit: opts.warm ?? config.catalog.warmLyricsPerRun });
        const stats = { inserted, warm, ms: Date.now() - startedAt };
        logger.info('catalog_refreshed', stats);
        return stats;
    })().finally(() => { refreshing = null; });
    return refreshing;
}

/** Ensure a minimum catalog exists at startup. */
async function ensureCatalog() {
    if (mongoose.connection.readyState !== 1) return { skipped: true };
    const result = { synthetic: 0, provider: 0 };
    if (config.provider.includeSynthetic || config.provider.name === 'synthetic') {
        result.synthetic = await seedSyntheticCatalog();
    }
    if (config.provider.name !== 'synthetic') {
        const licensedCount = await Track.countDocuments({ synthetic: false, status: 'ACTIVE', hasLyrics: true });
        if (licensedCount < config.catalog.minLicensedTracks) {
            result.provider = await refreshCatalog();
        }
    }
    return result;
}

/**
 * Resolve the lyric asset for a track. Reads the stored asset when fresh,
 * otherwise fetches from the provider and stores it with the licence TTL.
 */
async function getLyricAsset(track, { bypassMemory = false } = {}) {
    const cacheKey = String(track._id);
    const cached = bypassMemory ? null : cache.get('lyricContent', cacheKey);
    if (cached) return cached;

    const stored = await LyricAsset.findOne({ trackId: track._id, provider: track.provider }).lean();
    const fresh = stored && (!stored.expiresAt || stored.expiresAt > new Date());
    if (fresh) {
        cache.set('lyricContent', cacheKey, stored);
        return stored;
    }

    const provider = providerFor(track);
    let lyric;
    try {
        lyric = await provider.getLyrics(track.providerTrackId);
    } catch (err) {
        logger.error('provider_error', { provider: provider.name, code: err.code, trackId: cacheKey, message: err.message, phase: 'lyrics' });
        if (err instanceof ProviderError && ['RESTRICTED', 'NOT_FOUND'].includes(err.code)) {
            await Track.updateOne({ _id: track._id }, { $set: { hasLyrics: false, disabledReason: `provider:${err.code}` } });
            cache.clear('trackMetadata');
        }
        if (stored) return stored; // stale-but-present beats nothing when the provider is down
        throw err;
    }
    // The lyric body is the first time we learn the sung language (chart rows do not
    // carry it): record it and retire tracks outside the allowed languages.
    if (!track.synthetic && lyric.language) {
        const lang = String(lyric.language).toLowerCase();
        const allowed = config.provider.allowedLanguages;
        const update = { language: lang };
        if (lyric.explicit) update.explicit = true;
        if (allowed.length && !allowed.includes(lang)) {
            update.status = 'DISABLED';
            update.disabledReason = `language:${lang}`;
            logger.info('track_disabled_language', { trackId: cacheKey, language: lang });
        }
        await Track.updateOne({ _id: track._id }, { $set: update });
        if (update.status) { cache.clear('trackMetadata'); throw new ProviderError('RESTRICTED', `Lyrics are in ${lang}`, { provider: provider.name }); }
    }
    const ttl = track.synthetic ? null : new Date(Date.now() + config.cache.lyricContentTtlMs);
    const doc = await LyricAsset.findOneAndUpdate(
        { trackId: track._id, provider: track.provider },
        { $set: { ...lyric, trackId: track._id, expiresAt: ttl } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    cache.set('lyricContent', cacheKey, doc);
    return doc;
}

/**
 * Artist scope.
 *
 * A round can be limited to one artist. The catalogue holds whatever the
 * charts and genre lists brought in; an artist somebody asks for is pulled
 * from the provider on demand and kept, so the first request for a new
 * artist costs a few seconds and the next costs nothing.
 */
/**
 * Rows written before artist keys followed the lead credit still carry keys like
 * "lil-wayne-feat-drake". Re-key them once; cheap, idempotent, runs at boot.
 */
async function normalizeArtistKeys() {
    const rows = await Track.find({ artist: /\b(feat|ft)\.?\s|\bfeaturing\b/i }).select('artist artistKey').lean();
    let changed = 0;
    for (const r of rows) {
        const key = leadArtistKey(r.artist);
        if (key && key !== r.artistKey) { await Track.updateOne({ _id: r._id }, { $set: { artistKey: key } }); changed++; }
    }
    if (changed) { cache.clear('trackMetadata'); logger.info('artist_keys_normalized', { changed }); }
    return changed;
}

async function searchArtists({ query = '', limit = 10 } = {}) {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const provider = getLyricProvider();
    // What we already hold, first: it is instant and it is what can be played now.
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const local = await Track.aggregate([
        { $match: { status: 'ACTIVE', hasLyrics: true, artist: { $regex: escaped, $options: 'i' } } },
        { $sort: { artist: 1 } },
        { $group: { _id: '$artistKey', name: { $first: '$artist' }, providerArtistId: { $first: '$providerArtistId' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit }
    ]);
    const out = local
        .filter((r) => r._id === leadArtistKey(r.name))          // a stray feature key is not an artist
        .map((r) => ({ artistKey: r._id, name: r.name.split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0], providerArtistId: r.providerArtistId || null, tracks: r.count, seeded: true }));
    if (typeof provider.searchArtists === 'function') {
        try {
            const remote = await provider.searchArtists({ query: q, pageSize: limit });
            for (const a of remote) {
                const key = slugify(a.name);
                if (out.some((o) => o.artistKey === key)) continue;
                out.push({ artistKey: key, name: a.name, providerArtistId: a.providerArtistId, tracks: 0, seeded: false });
            }
        } catch (err) {
            logger.warn('provider_error', { provider: provider.name, code: err.code, message: err.message, phase: 'artist_search' });
        }
    }
    return out.slice(0, limit);
}

/**
 * Pull one artist's tracks into the catalogue. Returns how many are now playable.
 *
 * Two passes: by provider id first, then by name when the id came up short
 * (Musixmatch holds several ids per big name and the picker cannot tell which
 * one carries the songs). Only the artist's own credits count: a track whose
 * artist slug is not the requested artist is skipped, so a "feat." credit can
 * never pad the pool.
 */
async function seedArtistTracks({ providerArtistId = null, artistKey = null, name = null, pages = config.catalog.artistPages } = {}) {
    const provider = getLyricProvider();
    const key = artistKey || (name ? leadArtistKey(name) : null);
    const min = config.catalog.minArtistTracks;
    let inserted = 0;
    const report = { id: null, name: null, learnedId: null, probes: [], errors: [], rejected: [] };
    const acceptedIds = new Set(providerArtistId ? [String(providerArtistId)] : []);
    // "Lil Wayne", "Lil Wayne feat. Drake", "Lil Wayne & Drake", "Lil Wayne, Future": the
    // artist leads the credit. "Drake feat. Lil Wayne" does not.
    const leads = (t) => {
        if (!name) return false;
        const a = String(t.artist || '').toLowerCase().trim();
        const n = String(name).toLowerCase().trim();
        return a === n || (a.startsWith(n) && /^[\s,&x+/]|^\s*(feat|ft|featuring|and|with)\b/i.test(a.slice(n.length)));
    };
    const own = (t) => {
        if (!t.hasLyrics || t.instrumental) return false;
        if (!key) return true;
        if (t.artistKey === key) return true;
        if (leads(t) || acceptedIds.has(String(t.providerArtistId))) { t.artistKey = key; return true; }
        if (report.rejected.length < 4) report.rejected.push(t.artist);
        return false;
    };

    async function pull(label, fetchPage) {
        report[label] = 0;
        const seen = [];
        try {
            for (let page = 1; page <= pages; page++) {
                const tracks = await fetchPage(page);
                report[label] += tracks.length;
                if (!tracks.length) { if (page === 1) continue; break; }
                for (const t of tracks) {
                    seen.push(t);
                    if (!own(t)) continue;
                    await upsertTrack(t);
                    inserted++;
                }
                if (tracks.length < config.provider.musixmatch.seedPageSize) break;
            }
        } catch (err) {
            logger.error('provider_error', { provider: provider.name, code: err.code, message: err.message, phase: `artist_seed_${label}`, providerArtistId, name });
            report.errors.push(`${label}:${err.code || 'ERROR'}`);
            if (!(err instanceof ProviderError)) throw err;
        }
        return seen;
    }
    const count = async () => (key ? Track.countDocuments({ status: 'ACTIVE', hasLyrics: true, instrumental: false, artistKey: key }) : 0);

    if (providerArtistId && typeof provider.getArtistTracks === 'function') {
        await pull('id', (page) => provider.getArtistTracks({ providerArtistId, page }));
    }
    let playable = await count();
    if (playable < min && name && typeof provider.getArtistTracksByName === 'function') {
        const seen = await pull('name', (page) => provider.getArtistTracksByName({ name, page }));
        playable = await count();
        // The provider files the artist under several ids; the one their own credits
        // carry most often is the real one. Pull by it for depth when still short.
        const tally = new Map();
        for (const t of seen) if (leads(t) && t.providerArtistId) tally.set(String(t.providerArtistId), (tally.get(String(t.providerArtistId)) || 0) + 1);
        const learned = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0];
        if (learned && !acceptedIds.has(learned[0])) {
            report.learnedId = learned[0];
            acceptedIds.add(learned[0]);
            if (playable < min && typeof provider.getArtistTracks === 'function') {
                await pull('id', (page) => provider.getArtistTracks({ providerArtistId: learned[0], page }));
                playable = await count();
            }
        }
    }
    // Still short: the provider keeps several entries under the same name and the
    // picker cannot tell which one holds the songs. Try each, one page, keep the richest.
    if (playable < min && name && typeof provider.listArtistIds === 'function' && typeof provider.getArtistTracks === 'function') {
        try {
            const entries = (await provider.listArtistIds({ query: name }))
                .filter((a) => leadArtistKey(a.name) === key && !acceptedIds.has(String(a.providerArtistId)))
                .slice(0, 6);
            let best = null;
            const firstPages = new Map();
            for (const a of entries) {
                const id = String(a.providerArtistId);
                let page1 = [];
                try { page1 = await provider.getArtistTracks({ providerArtistId: id, page: 1 }); } catch (err) { report.errors.push(`probe:${err.code || 'ERROR'}`); if (!(err instanceof ProviderError)) throw err; continue; }
                const usable = page1.filter((t) => t.hasLyrics && !t.instrumental).length;
                report.probes.push(`${id}:${usable}`);
                firstPages.set(id, page1);
                if (!best || usable > best.usable) best = { id, usable };
                if (usable >= config.provider.musixmatch.seedPageSize) break;   // a full page: this is the one
            }
            if (best && best.usable > 0) {
                acceptedIds.add(best.id);
                report.learnedId = best.id;
                for (const t of firstPages.get(best.id)) { if (own(t)) { await upsertTrack(t); inserted++; } }
                if (pages > 1) await pull('id', async (page) => (page === 1 ? [] : provider.getArtistTracks({ providerArtistId: best.id, page })));
                playable = await count();
            }
        } catch (err) {
            logger.error('provider_error', { provider: provider.name, code: err.code, message: err.message, phase: 'artist_seed_probe', name });
            report.errors.push(`probe:${err.code || 'ERROR'}`);
            if (!(err instanceof ProviderError)) throw err;
        }
    }
    cache.clear('trackMetadata');
    const resolvedKey = key || (providerArtistId ? (await Track.findOne({ provider: provider.name, providerArtistId: String(providerArtistId) }).select('artistKey').lean())?.artistKey : null) || null;
    if (!key && resolvedKey) playable = await Track.countDocuments({ status: 'ACTIVE', hasLyrics: true, instrumental: false, artistKey: resolvedKey });
    logger.info('artist_seeded', { provider: provider.name, providerArtistId, name, artistKey: resolvedKey, inserted, playable, report });
    return { artistKey: resolvedKey, inserted, playable, report };
}

/**
 * Make sure an artist has enough playable tracks for a round; seed if not.
 * Resolves the canonical artistKey and display name from the catalogue.
 */
async function ensureArtist({ providerArtistId = null, artistKey = null, name = null } = {}) {
    const min = config.catalog.minArtistTracks;
    const provider = getLyricProvider();
    let key = artistKey || (name ? leadArtistKey(name) : null);
    let count = key ? await Track.countDocuments({ status: 'ACTIVE', hasLyrics: true, instrumental: false, artistKey: key }) : 0;
    let report = null;
    if (count < min && (providerArtistId || name)) {
        const seeded = await seedArtistTracks({ providerArtistId, artistKey: key, name });
        key = seeded.artistKey || key;
        count = seeded.playable;
        report = seeded.report;
    }
    if (!key) return null;
    const sample = await Track.findOne({ artistKey: key, status: 'ACTIVE' }).sort({ artist: 1 }).select('artist providerArtistId').lean();
    const display = (sample?.artist || name || key).split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0];
    return { artistKey: key, name: display, providerArtistId: sample?.providerArtistId || (providerArtistId ? String(providerArtistId) : null), playable: count, provider: provider.name, report };
}

/**
 * Eligible tracks for a gameplay context. Cached briefly per context so the
 * question engine never queries Mongo per question.
 */
async function getEligibleTracks(context = {}) {
    const genre = context.genre && context.genre !== 'all' ? context.genre : 'all';
    const artistKey = context.artistKey || null;
    const includeSynthetic = context.allowSynthetic !== false && (config.provider.includeSynthetic || config.provider.name === 'synthetic');
    const key = `eligible:${genre}:${artistKey || '*'}:${context.gameMode || '*'}:${context.territory || '*'}:${includeSynthetic ? 's' : 'ns'}`;
    const cached = cache.get('trackMetadata', key);
    if (cached) return cached;

    const query = { status: 'ACTIVE', hasLyrics: true, instrumental: false };
    if (genre !== 'all') query.primaryGenre = genre;
    if (artistKey) query.artistKey = artistKey;
    if (!includeSynthetic) query.synthetic = false;
    const [docs, restrictions] = await Promise.all([
        Track.find(query).lean(),
        restrictionService.getSnapshot()
    ]);
    const eligible = docs.filter((t) => isTrackEligibleForGame(t, context, restrictions).eligible);
    cache.set('trackMetadata', key, eligible, Math.min(config.cache.trackMetadataTtlMs, 60 * 1000));
    return eligible;
}

function invalidateTracks() {
    cache.clear('trackMetadata');
}

async function setTrackStatus(trackId, status, reason = '') {
    const doc = await Track.findByIdAndUpdate(trackId, { $set: { status, disabledReason: status === 'DISABLED' ? reason : '' } }, { new: true });
    invalidateTracks();
    return doc;
}

async function listCategories() {
    const rows = await Track.aggregate([
        { $match: { status: 'ACTIVE', hasLyrics: true } },
        { $group: { _id: '$primaryGenre', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
    return rows.map((r) => ({ genre: r._id, count: r.count }));
}

module.exports = {
    upsertTrack,
    seedSyntheticCatalog,
    seedFromProvider,
    warmLyrics,
    refreshCatalog,
    ensureCatalog,
    getLyricAsset,
    getEligibleTracks,
    invalidateTracks,
    setTrackStatus,
    listCategories, searchArtists, seedArtistTracks, ensureArtist, normalizeArtistKeys };
