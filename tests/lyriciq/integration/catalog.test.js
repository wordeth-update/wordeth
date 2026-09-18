/**
 * Catalog upkeep against a fake licensed provider: chart + genre seeding,
 * lyric warming, language retirement, and the internal refresh route.
 */
require('../../setup');
const request = require('supertest');
const { buildApp, seed, db } = require('../helpers/app');
const Track = require('../../../src/lyriciq/models/Track');
const LyricAsset = require('../../../src/lyriciq/models/LyricAsset');
const catalogService = require('../../../src/lyriciq/services/content/catalogService');
const { setLyricProvider, getSyntheticProvider } = require('../../../src/lyriciq/providers/lyrics');
const { finalizeTrack, finalizeLyricAsset } = require('../../../src/lyriciq/providers/lyrics/normalizeTrack');
const { ProviderError } = require('../../../src/lyriciq/utilities/errors');

const KEY = { 'X-Internal-Key': 'test-internal-key' };

/** Minimal licensed-provider double with the same contract as Musixmatch. */
class FakeProvider {
    constructor() {
        this.name = 'musixmatch';
        this.calls = { chart: 0, genre: 0, lyrics: 0 };
        this.failLyrics = null;
        this.tracks = {
            1: { title: 'Concrete Sermon', artist: 'Marlow Reign', genres: ['Hip Hop/Rap'], rating: 90, lang: 'en' },
            2: { title: 'Rearview Lanes', artist: 'Kade Lumen', genres: [], rating: 80, lang: 'en' },
            3: { title: 'Canción del Barrio', artist: 'Los Ecos', genres: ['Latin'], rating: 70, lang: 'es' },
            4: { title: 'Instrumental Break', artist: 'Kade Lumen', genres: ['Pop'], rating: 60, lang: 'en', instrumental: true }
        };
    }
    _track(id, genreFallback) {
        const t = this.tracks[id];
        const n = finalizeTrack({ provider: this.name, providerTrackId: id, title: t.title, artist: t.artist, genres: t.genres, hasLyrics: true, instrumental: !!t.instrumental, popularity: t.rating, releaseDate: '2020-01-01' });
        if (genreFallback && n.primaryGenre === 'other') n.primaryGenre = genreFallback;
        return n;
    }
    async getPopularTracks() { this.calls.chart++; return [this._track(1), this._track(3), this._track(4)]; }
    async getGenreTracks({ genre }) { this.calls.genre++; return genre === 'rnb' ? [this._track(2, 'rnb')] : []; }
    async searchTracks() { return []; }
    async getTrack(id) { return this._track(id); }
    async getLyrics(id) {
        this.calls.lyrics++;
        if (this.failLyrics) throw new ProviderError(this.failLyrics, 'boom', { provider: this.name, retryable: true });
        const t = this.tracks[id];
        const body = t.lang === 'es' ? 'Una línea de prueba aquí\nOtra línea de prueba\nY una tercera línea' : 'Spray paint scripture on the boiler room\nThe neighbors pound the ceiling like a metronome\nEvery rhyme a brick inside the tower\nWe count the hours by the streetlight power';
        return finalizeLyricAsset({ provider: this.name, providerLyricId: 'l' + id, body, language: t.lang, copyright: 'test' });
    }
}

let app; let fake;
beforeAll(async () => { await db.connect(__filename); await seed(); app = buildApp(); });
afterAll(async () => { setLyricProvider(getSyntheticProvider()); await db.disconnect(); });
beforeEach(() => { fake = new FakeProvider(); setLyricProvider(fake); });

describe('catalog upkeep with a licensed provider', () => {
    test('refresh pulls the chart and every genre, skips instrumentals, warms lyrics and retires other languages', async () => {
        const stats = await catalogService.refreshCatalog({ warm: 10 });
        expect(fake.calls.chart).toBeGreaterThan(0);
        expect(fake.calls.genre).toBeGreaterThan(0);
        // Instrumental (4) never enters; 1, 2 and 3 do.
        const licensed = await Track.find({ provider: 'musixmatch' }).lean();
        expect(licensed.map((t) => t.providerTrackId).sort()).toEqual(['1', '2', '3']);
        // Genre fallback from the requested genre when the provider has no usable tag.
        expect(licensed.find((t) => t.providerTrackId === '2').primaryGenre).toBe('rnb');
        // Warming stored English lyrics and retired the Spanish track on first fetch.
        const assets = await LyricAsset.find({ provider: 'musixmatch' }).lean();
        expect(assets.map((a) => a.providerLyricId).sort()).toEqual(['l1', 'l2']);
        const spanish = await Track.findOne({ provider: 'musixmatch', providerTrackId: '3' }).lean();
        expect(spanish.status).toBe('DISABLED');
        expect(spanish.disabledReason).toBe('language:es');
        expect(spanish.language).toBe('es');
        expect(stats.inserted).toBe(3);
        expect(stats.warm).toMatchObject({ warmed: 2, disabled: 1 });
        // Retired tracks leave the play pool; English ones are in it.
        const pool = await catalogService.getEligibleTracks({ allowSynthetic: false });
        expect(pool.map((t) => t.providerTrackId).sort()).toEqual(['1', '2']);
    });

    test('a second warm run touches nothing that is already fresh', async () => {
        await catalogService.refreshCatalog({ warm: 10 });
        fake.calls.lyrics = 0;
        const again = await catalogService.warmLyrics({ limit: 10, delayMs: 0 });
        expect(fake.calls.lyrics).toBe(0);
        expect(again.warmed).toBe(0);
    });

    test('warming stops at the first rate limit instead of hammering the provider', async () => {
        await catalogService.seedFromProvider({ chart: true, pages: 1, genres: ['rnb'] });
        await LyricAsset.deleteMany({ provider: 'musixmatch' });
        fake.failLyrics = 'RATE_LIMITED';
        const r = await catalogService.warmLyrics({ limit: 10, delayMs: 0 });
        expect(r.stopped).toBe('RATE_LIMITED');
        expect(fake.calls.lyrics).toBe(1);
    });

    test('internal refresh and warm routes run the same jobs', async () => {
        const res = await request(app).post('/api/internal/catalog/refresh').set(KEY).send({ warm: 5 }).expect(200);
        expect(res.body.inserted).toBe(3);
        const warm = await request(app).post('/api/internal/catalog/warm').set(KEY).send({ limit: 5 }).expect(200);
        expect(warm.body).toMatchObject({ warmed: 0 });
        await request(app).post('/api/internal/catalog/refresh').send({}).expect(401);
    });
});
