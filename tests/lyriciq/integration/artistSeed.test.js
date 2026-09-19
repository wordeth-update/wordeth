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
            { providerArtistId: '1039', name: 'Lil Wayne', rating: 70 }, { providerArtistId: '5', name: 'Lil Tecca', rating: 60 },
            { providerArtistId: '301', name: 'Lil Wayne feat. Drake', rating: 65 }, { providerArtistId: '302', name: 'Lil Wayne feat. Bruno Mars', rating: 64 },
            { providerArtistId: '303', name: 'Drake feat. Lil Wayne', rating: 63 }
        ];
    }
    async getArtistTracks({ providerArtistId, page }) {
        this.calls.push(['id', providerArtistId, page]);
        if (page > 1 && providerArtistId !== '1039') return [];
        if (providerArtistId === '1') return [track(1, 'Lil Wayne', 'A Milli', '1'), track(2, 'Lil Wayne', 'Go DJ', '1')];
        if (providerArtistId === '2') return [];
        if (providerArtistId === '1039') {
            if (page === 1) return Array.from({ length: 25 }, (_, i) => track(100 + i, i % 4 === 0 ? 'Lil Wayne feat. Drake' : 'Lil Wayne', 'Song ' + i, '1039'));
            if (page === 2) return [track(200, 'Lil Wayne', 'Fireman', '1039')];
            return [];
        }
        if (providerArtistId === '301') return [track(301, 'Lil Wayne feat. Drake', 'She Will', '301'), track(311, 'Lil Wayne feat. Drake', 'Believe Me', '301')];
        if (providerArtistId === '302') return [track(302, 'Lil Wayne feat. Bruno Mars', 'Mirror', '302')];
        if (providerArtistId === '303') return [track(303, 'Drake feat. Lil Wayne', 'HYFR', '303')];
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

test('gathers from every entity the artist leads, reads the richest to the end, keeps guest verses out', async () => {
    const fake = providers.getLyricProvider();
    const r = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    expect(r.artistKey).toBe('lil-wayne');
    // oldest entities first: 2 (picked id) + 0 (id 2) + 2 (301) + 1 (302) + 25 (1039, page 1) → target reached
    expect(r.playable).toBe(30);
    expect(r.report.learnedId).toBe('1039');
    expect(r.report.probes).toEqual(['2:0', '301:2', '302:1', '1039:25']);
    for (const title of ['Ransom', 'Drip Too Hard', 'X', 'HYFR']) expect(await Track.findOne({ title }).lean()).toBeNull();
    expect((await Track.findOne({ title: 'Song 4' }).lean()).artistKey).toBe('lil-wayne');
    fake.calls.length = 0;
    const again = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    expect(again.playable).toBe(30);
    expect(fake.calls).toHaveLength(0);
});

test('when the plain entries are thin, the collaboration entities add up', async () => {
    await Track.deleteMany({ artistKey: 'lil-wayne' });
    const fake = providers.getLyricProvider();
    const rich = fake.getArtistTracks.bind(fake);
    fake.getArtistTracks = async ({ providerArtistId, page }) => (providerArtistId === '1039' ? [] : rich({ providerArtistId, page }));
    config.catalog.minArtistTracks = 4;
    const r = await catalogService.ensureArtist({ providerArtistId: '1', name: 'Lil Wayne' });
    fake.getArtistTracks = rich;
    // 2 solo + 2 with Drake + 1 with Bruno Mars; Drake's own song with him as guest stays out
    expect(r.playable).toBe(5);
    expect(r.report.probes).toEqual(['2:0', '301:2', '302:1', '1039:0']);
    expect(await Track.findOne({ title: 'HYFR' }).lean()).toBeNull();
    expect((await Track.findOne({ title: 'Mirror' }).lean()).artistKey).toBe('lil-wayne');
});
