const { isTrackEligibleForGame, buildRestrictionSnapshot } = require('../../../src/lyriciq/services/content/eligibility');

const track = { _id: 't1', artist: 'Vera Solace', artistKey: 'vera-solace', album: 'Midnight Grammar', provider: 'musixmatch', hasLyrics: true, instrumental: false, explicit: true, primaryGenre: 'pop', status: 'ACTIVE' };

describe('isTrackEligibleForGame', () => {
    test('basic gates', () => {
        expect(isTrackEligibleForGame(track).eligible).toBe(true);
        expect(isTrackEligibleForGame({ ...track, hasLyrics: false }).reason).toBe('NO_LYRICS');
        expect(isTrackEligibleForGame({ ...track, instrumental: true }).reason).toBe('INSTRUMENTAL');
        expect(isTrackEligibleForGame({ ...track, status: 'DISABLED' }).reason).toBe('TRACK_DISABLED');
        expect(isTrackEligibleForGame(track, { genre: 'rock' }).reason).toBe('GENRE_MISMATCH');
        expect(isTrackEligibleForGame(track, { allowExplicit: false }).reason).toBe('EXPLICIT_NOT_ALLOWED');
        expect(isTrackEligibleForGame(null).reason).toBe('NO_TRACK');
    });
    test('restrictions by track, artist, album, provider, territory, mode and explicit flag', () => {
        const snap = buildRestrictionSnapshot([
            { type: 'TRACK', value: 't1', active: true },
            { type: 'ARTIST', value: 'Vera Solace', active: true, gameModes: ['STREAK'] },
            { type: 'ALBUM', value: 'Midnight Grammar', active: false },
            { type: 'PROVIDER', value: 'Synthetic', active: true },
            { type: 'TERRITORY', value: 'de', active: true },
            { type: 'GAME_MODE', value: 'RAPID_FIRE', active: true },
            { type: 'EXPLICIT', value: 'true', active: true, gameModes: ['DAILY_10'] }
        ]);
        expect(isTrackEligibleForGame(track, {}, snap).reason).toBe('TRACK_RESTRICTED');
        const other = { ...track, _id: 't2' };
        expect(isTrackEligibleForGame(other, { gameMode: 'QUICK_PLAY' }, snap).eligible).toBe(true);
        expect(isTrackEligibleForGame(other, { gameMode: 'STREAK' }, snap).reason).toBe('ARTIST_RESTRICTED');
        expect(isTrackEligibleForGame({ ...other, artistKey: 'x', provider: 'synthetic' }, {}, snap).reason).toBe('PROVIDER_RESTRICTED');
        expect(isTrackEligibleForGame({ ...other, artistKey: 'x' }, { territory: 'DE' }, snap).reason).toBe('TERRITORY_RESTRICTED');
        expect(isTrackEligibleForGame({ ...other, artistKey: 'x' }, { gameMode: 'RAPID_FIRE' }, snap).reason).toBe('GAME_MODE_DISABLED');
        expect(isTrackEligibleForGame({ ...other, artistKey: 'x' }, { gameMode: 'DAILY_10' }, snap).reason).toBe('EXPLICIT_RESTRICTED');
        expect(isTrackEligibleForGame({ ...other, artistKey: 'x', explicit: false }, { gameMode: 'DAILY_10' }, snap).eligible).toBe(true);
    });
});
