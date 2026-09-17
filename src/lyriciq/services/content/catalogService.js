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

/**
 * Pull tracks from the licensed provider into the catalog. Lyrics are fetched
 * lazily at question time, not here, to keep provider calls minimal.
 */
async function seedFromProvider({ queries = [], chart = true, country = 'us', pages = 1, pageSize } = {}) {
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
        for (const q of queries) {
            await handle(await provider.searchTracks({ query: q, pageSize }));
        }
    } catch (err) {
        logger.error('provider_error', { provider: provider.name, code: err.code, message: err.message, phase: 'seed' });
        if (!(err instanceof ProviderError)) throw err;
    }
    cache.clear('trackMetadata');
    logger.info('catalog_seeded', { provider: provider.name, inserted });
    return inserted;
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
        if (licensedCount < 20) {
            result.provider = await seedFromProvider({ chart: true, pages: 2 });
        }
    }
    return result;
}

/**
 * Resolve the lyric asset for a track. Reads the stored asset when fresh,
 * otherwise fetches from the provider and stores it with the licence TTL.
 */
async function getLyricAsset(track) {
    const cacheKey = String(track._id);
    const cached = cache.get('lyricContent', cacheKey);
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
 * Eligible tracks for a gameplay context. Cached briefly per context so the
 * question engine never queries Mongo per question.
 */
async function getEligibleTracks(context = {}) {
    const genre = context.genre && context.genre !== 'all' ? context.genre : 'all';
    const includeSynthetic = context.allowSynthetic !== false && (config.provider.includeSynthetic || config.provider.name === 'synthetic');
    const key = `eligible:${genre}:${context.gameMode || '*'}:${context.territory || '*'}:${includeSynthetic ? 's' : 'ns'}`;
    const cached = cache.get('trackMetadata', key);
    if (cached) return cached;

    const query = { status: 'ACTIVE', hasLyrics: true, instrumental: false };
    if (genre !== 'all') query.primaryGenre = genre;
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
    ensureCatalog,
    getLyricAsset,
    getEligibleTracks,
    invalidateTracks,
    setTrackStatus,
    listCategories
};
