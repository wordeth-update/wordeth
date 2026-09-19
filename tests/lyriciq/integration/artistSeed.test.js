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

function track(id, artist, title, artistId = '999') {
    return finalizeTrack({ provider: 'musixmatch', providerTrackId: String(id), providerArtistId: artistId, title, artist, album: 'A', hasLyrics: true, instrumental: false, explicit: false, popularity: 50, releaseYear: 2015, primaryGenre: 'hiphop', language: 'en', artwork: null });
}

class FakeMusixmatch extends providers.SyntheticProvider {
    constructor() { super(); this.name = 'musixmatch'; this.calls = []; }
    async searchArtists() { return [{ providerArtistId: '1', name: 'Lil Wayne', rating: 90 }]; }
    async getArtistTracks({ providerArtistId, page }) {
        this.calls.push(['id', providerArtistId, page]);
        if (page > 1) return [];
        if (providerArtistId === '1') return [track(1, 'Lil Wayne', 'A Milli', '1'), track(2, 'Lil Wayne', 'Go DJ', '1')];
        if (providerArtistId === '1039') return [track(20, 'Lil Wayne', 'Fireman', '1039'), track(21, 'Lil Wayne', 'Hustler Musik', '1039'), track(22, 'Lil Wayne', 'Blunt Blowin', '1039')];
        return [];
    }
    async getArtistTracksByName({ name, page }) {
        this.calls.push(['name', name, page]);
        if (page > 1) return [];
        return [
            track(10, 'Lil Wayne & Drake', 'Right Above It', '1039'), track(11, 'Lil Wayne, Future', 'Love Me', '1039'),
            track(12, 'Lil Wayne feat. Bruno Mars', 'Mirror', '1039'), track(7, 'Drake feat. Lil Wayne', 'HYFR', '77'),
            track(8, 'Chris Brown feat. Lil Wayne', 'Loyal', '55'), track(9, 'Young Money', 'Bedrock', '88')
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

test('learns the real id from the artist\'s own credits and reaches the minimum; guest verses stay out', async () => {
    const fake = providers.getLyricProvider();
    const r = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    expect(r.artistKey).toBe('lil-wayne');
    // 2 from the picked id + 3 lead credits from the name search + 3 from the learned id
    expect(r.playable).toBe(8);
    expect(r.report.learnedId).toBe('1039');
    expect(fake.calls.some((c) => c[0] === 'id' && c[1] === '1039')).toBe(true);
    expect(await Track.findOne({ title: 'HYFR' }).lean()).toBeNull();
    expect(await Track.findOne({ title: 'Loyal' }).lean()).toBeNull();
    expect(await Track.findOne({ title: 'Bedrock' }).lean()).toBeNull();
    const mirror = await Track.findOne({ title: 'Mirror' }).lean();
    expect(mirror.artistKey).toBe('lil-wayne');
    expect(mirror.artist).toBe('Lil Wayne feat. Bruno Mars');
    // Second time round nothing is fetched: the catalogue already holds enough.
    fake.calls.length = 0;
    const again = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    expect(again.playable).toBe(8);
    expect(fake.calls).toHaveLength(0);
});
