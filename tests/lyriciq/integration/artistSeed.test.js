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
    async listArtistIds() {
        return [
            { providerArtistId: '1', name: 'Lil Wayne', rating: 90 }, { providerArtistId: '2', name: 'Lil Wayne', rating: 80 },
            { providerArtistId: '1039', name: 'Lil Wayne', rating: 70 }, { providerArtistId: '5', name: 'Lil Tecca', rating: 60 }
        ];
    }
    async getArtistTracks({ providerArtistId, page }) {
        this.calls.push(['id', providerArtistId, page]);
        if (providerArtistId === '1') return page === 1 ? [track(1, 'Lil Wayne', 'A Milli', '1'), track(2, 'Lil Wayne', 'Go DJ', '1')] : [];
        if (providerArtistId === '2') return [];
        if (providerArtistId === '1039') {
            if (page === 1) return Array.from({ length: 25 }, (_, i) => track(100 + i, i % 4 === 0 ? 'Lil Wayne feat. Drake' : 'Lil Wayne', 'Song ' + i, '1039'));
            if (page === 2) return [track(200, 'Lil Wayne', 'Fireman', '1039')];
            return [];
        }
        return [];
    }
    async getArtistTracksByName({ name, page }) {
        this.calls.push(['name', name, page]);
        if (page > 1) return [];
        // Musixmatch's name search is loose: mostly other "Lil" artists.
        return [track(7, 'Lil Tecca', 'Ransom', '5'), track(8, 'Lil Baby', 'Drip Too Hard', '6'), track(9, 'Babyface Ray feat. Lil Yachty', 'X', '7')];
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

test('probes the provider\'s sibling entries for the one that holds the songs; other "Lil" artists stay out', async () => {
    const fake = providers.getLyricProvider();
    const r = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    expect(r.artistKey).toBe('lil-wayne');
    // 2 from the picked id + nothing usable from the loose name search + 26 from the richest entry
    expect(r.playable).toBe(28);
    expect(r.report.learnedId).toBe('1039');
    expect(r.report.probes).toEqual(['2:0', '1039:25']);
    expect(fake.calls.some((c) => c[0] === 'id' && c[1] === '1039' && c[2] === 2)).toBe(true);
    for (const title of ['Ransom', 'Drip Too Hard', 'X']) expect(await Track.findOne({ title }).lean()).toBeNull();
    const feat = await Track.findOne({ title: 'Song 4' }).lean();
    expect(feat.artistKey).toBe('lil-wayne');
    // Second time round nothing is fetched: the catalogue already holds enough.
    fake.calls.length = 0;
    const again = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    expect(again.playable).toBe(28);
    expect(fake.calls).toHaveLength(0);
});
