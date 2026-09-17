const { MusixmatchProvider } = require('../../../src/lyriciq/providers/lyrics');
const { ProviderError } = require('../../../src/lyriciq/utilities/errors');
const { extractUsableLines, normalizeGenre } = require('../../../src/lyriciq/providers/lyrics/normalizeTrack');

function mm(body, status_code = 200) {
    return { data: { message: { header: { status_code }, body } } };
}
const rawTrack = { track_id: 123, track_name: 'Test Song', artist_name: 'Test Artist', artist_id: 9, album_name: 'Album', album_id: 5, has_lyrics: 1, instrumental: 0, explicit: 1, track_rating: 77, first_release_date: '2011-05-01T00:00:00Z', primary_genres: { music_genre_list: [{ music_genre: { music_genre_name: 'Hip Hop/Rap' } }] }, album_coverart_800x800: 'https://img/nocover.png', album_coverart_350x350: 'https://img/cover.jpg' };

function provider(get) {
    return new MusixmatchProvider({ apiKey: 'k', http: { get } });
}

describe('MusixmatchProvider', () => {
    test('normalises a track', async () => {
        const p = provider(async () => mm({ track: rawTrack }));
        const t = await p.getTrack(123);
        expect(t).toMatchObject({ provider: 'musixmatch', providerTrackId: '123', title: 'Test Song', artist: 'Test Artist', artistKey: 'test-artist', primaryGenre: 'hiphop', releaseYear: 2011, decade: '2010s', explicit: true, hasLyrics: true, popularity: 77, artwork: 'https://img/cover.jpg' });
    });
    test('normalises lyrics and strips provider noise', async () => {
        const body = 'Line one is here\nLine two is here\n...\n\n******* This Lyrics is NOT for Commercial use *******\n(1409623321456)';
        const p = provider(async () => mm({ lyrics: { lyrics_id: 7, lyrics_body: body, lyrics_copyright: 'c', explicit: 0 } }));
        const l = await p.getLyrics(1);
        expect(l.lines).toEqual(['Line one is here', 'Line two is here']);
        expect(l.copyright).toBe('c');
        expect(l.provider).toBe('musixmatch');
    });
    test('search returns normalised list', async () => {
        const p = provider(async () => mm({ track_list: [{ track: rawTrack }] }));
        const list = await p.searchTracks({ query: 'x' });
        expect(list).toHaveLength(1);
    });
    const failing = [
        ['timeout', () => { const e = new Error('timeout of 8000ms exceeded'); e.code = 'ECONNABORTED'; throw e; }, 'TIMEOUT'],
        ['rate limit (402)', () => mm({}, 402), 'RATE_LIMITED'],
        ['http 429', () => { const e = new Error('x'); e.response = { status: 429 }; throw e; }, 'RATE_LIMITED'],
        ['unauthorized', () => mm({}, 401), 'UNAUTHORIZED'],
        ['missing lyrics', () => mm({}, 404), 'NOT_FOUND'],
        ['bad payload', () => ({ data: { nope: true } }), 'BAD_PAYLOAD'],
        ['malformed lyrics body', () => mm({ lyrics: { lyrics_id: 1 } }), 'BAD_PAYLOAD'],
        ['restricted', () => mm({ lyrics: { lyrics_id: 1, lyrics_body: 'x', restricted: 1 } }), 'RESTRICTED'],
        ['instrumental', () => mm({ lyrics: { lyrics_id: 1, lyrics_body: 'x', instrumental: 1 } }), 'RESTRICTED'],
        ['empty body', () => mm({ lyrics: { lyrics_id: 1, lyrics_body: '   ' } }), 'NOT_FOUND'],
        ['server error', () => mm({}, 500), 'UNAVAILABLE']
    ];
    test.each(failing)('maps %s to a ProviderError', async (_, get, code) => {
        const p = provider(async () => get());
        await expect(p.getLyrics(1)).rejects.toMatchObject({ name: 'ProviderError', code });
        await expect(p.getLyrics(1)).rejects.toBeInstanceOf(ProviderError);
    });
    test('requires an API key', () => {
        expect(() => new MusixmatchProvider({ apiKey: '' })).toThrow();
    });
    test('genre normalisation', () => {
        expect(normalizeGenre(['R&B/Soul'])).toBe('rnb');
        expect(normalizeGenre(['Country'])).toBe('country');
        expect(normalizeGenre(['Alternative'])).toBe('rock');
        expect(normalizeGenre(['Pop'])).toBe('pop');
        expect(normalizeGenre(['Jazz'])).toBe('other');
        expect(extractUsableLines('[Chorus]\nreal line here\n')).toEqual(['real line here']);
    });
});
