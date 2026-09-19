/**
 * Artist seeding against a provider that behaves like Musixmatch does: the id the
 * picker returned holds nothing, the name search holds the songs, and a feat. credit
 * by someone else is mixed in.
 */
require('../../setup');
const { seed, db } = require('../helpers/app');
const config = require('../../../src/lyriciq/config');
const Track = require('../../../src/lyriciq/models/Track');
const catalogService = require('../../../src/lyriciq/services/content/catalogService');
const providers = require('../../../src/lyriciq/providers/lyrics');
const { finalizeTrack } = require('../../../src/lyriciq/providers/lyrics/normalizeTrack');

function track(id, artist, title) {
    return finalizeTrack({ provider: 'musixmatch', providerTrackId: String(id), providerArtistId: '999', title, artist, album: 'A', hasLyrics: true, instrumental: false, explicit: false, popularity: 50, releaseYear: 2015, primaryGenre: 'hiphop', language: 'en', artwork: null });
}

class FakeMusixmatch extends providers.SyntheticProvider {
    constructor() { super(); this.name = 'musixmatch'; this.calls = []; }
    async searchArtists() { return [{ providerArtistId: '1', name: 'Lil Wayne', rating: 90 }]; }
    async getArtistTracks({ providerArtistId, page }) { this.calls.push(['id', providerArtistId, page]); return []; }
    async getArtistTracksByName({ name, page }) {
        this.calls.push(['name', name, page]);
        if (page > 1) return [];
        return [
            track(1, 'Lil Wayne', 'A Milli'), track(2, 'Lil Wayne', 'Lollipop'), track(3, 'Lil Wayne', 'Go DJ'),
            track(4, 'Lil Wayne', 'Fireman'), track(5, 'Lil Wayne', '6 Foot 7 Foot'), track(6, 'Lil Wayne', 'Mrs. Officer'),
            track(7, 'Drake feat. Lil Wayne', 'HYFR'), track(8, 'Lil Wayne feat. Drake', 'Right Above It')
        ];
    }
}

let previous;
beforeAll(async () => {
    await db.connect(__filename);
    await seed();
    previous = providers.getLyricProvider();
    providers.setLyricProvider(new FakeMusixmatch());
});
afterAll(async () => { providers.setLyricProvider(previous); await db.disconnect(); });

test('falls back to the name search when the picked id is empty and keeps only the artist\'s own songs', async () => {
    const fake = providers.getLyricProvider();
    const r = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    expect(r.artistKey).toBe('lil-wayne');
    expect(r.playable).toBe(7); // six solo credits plus his own feature; Drake's song stays out
    expect(r.playable).toBeGreaterThanOrEqual(config.catalog.minArtistTracks);
    expect(fake.calls[0][0]).toBe('id');
    expect(fake.calls.some((c) => c[0] === 'name')).toBe(true);
    const feat = await Track.findOne({ title: 'HYFR' }).lean();
    expect(feat).toBeNull();
    // Second time round nothing is fetched: the catalogue already holds enough.
    fake.calls.length = 0;
    const again = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    expect(again.playable).toBe(7);
    expect(fake.calls).toHaveLength(0);
});
