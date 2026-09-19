#!/usr/bin/env node
/**
 * Seed the Lyric IQ catalog from the configured lyric provider.
 *
 *   node scripts/lyriciq-seed-catalog.js --refresh       # chart + every genre + warm lyrics (what the schedule runs)
 *   node scripts/lyriciq-seed-catalog.js                 # chart tracks (2 pages, US)
 *   node scripts/lyriciq-seed-catalog.js --pages 4 --country gb
 *   node scripts/lyriciq-seed-catalog.js --genres hiphop,rnb --genre-pages 3
 *   node scripts/lyriciq-seed-catalog.js --query "artist name" --query "song title"
 *   node scripts/lyriciq-seed-catalog.js --warm 200      # also fetch lyric bodies for the 200 most popular unwarmed tracks
 *
 * Without --warm, lyrics are resolved lazily at question time and cached under
 * the licence TTL (LYRICIQ_CACHE_LYRIC_TTL_MS).
 */
require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const queries = args.reduce((acc, a, i) => (a === '--query' && args[i + 1] ? acc.concat(args[i + 1]) : acc), []);

(async () => {
    const uri = process.env.MONGODB_URI || (process.env.MONGODB_USERNAME && `mongodb+srv://${process.env.MONGODB_USERNAME}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@wrdthcluster.3kkpz37.mongodb.net/wordeth?retryWrites=true&w=majority`);
    if (!uri) throw new Error('MONGODB_URI (or Atlas credentials) required');
    await mongoose.connect(uri);
    const { validateLyricIqEnv } = require('../src/lyriciq/config/env');
    validateLyricIqEnv({ exitOnFailure: true });
    const catalog = require('../src/lyriciq/services/content/catalogService');
    if (args.includes('--refresh')) {
        const stats = await catalog.refreshCatalog({ warm: opt('warm', null) !== null ? parseInt(opt('warm'), 10) : undefined });
        console.log('Catalog refresh complete:', JSON.stringify(stats));
    } else {
        const inserted = await catalog.seedFromProvider({
            chart: !args.includes('--no-chart'),
            pages: parseInt(opt('pages', '2'), 10),
            country: opt('country', 'us'),
            genres: opt('genres', '') ? opt('genres').split(',').map((g) => g.trim()).filter(Boolean) : [],
            genrePages: parseInt(opt('genre-pages', '1'), 10),
            queries
        });
        console.log(`Catalog seed complete: ${inserted} tracks upserted.`);
        const warm = parseInt(opt('warm', '0'), 10);
        if (warm > 0) console.log('Lyrics warmed:', JSON.stringify(await catalog.warmLyrics({ limit: warm })));
    }
    await mongoose.disconnect();
})().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });
