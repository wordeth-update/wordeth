jest.mock('../services/fileStorage', () => ({ deleteByPrefix: jest.fn(async () => 2), deleteByKey: jest.fn(async (k) => k !== 'replays/missing.m4a') }));
const fileStorage = require('../services/fileStorage');
const { prefixesFor, keyFromUrl, flushAccountFiles } = require('../services/accountFiles');

describe('the files an account leaves behind', () => {
    test('are found by the account id in their key', () => {
        expect(prefixesFor('64abc')).toEqual(['avatars/64abc.', 'profile-photos/64abc-', 'music-snippets/64abc-', 'audio-messages/64abc-', 'board/64abc/']);
    });
    test('or by the URL a record kept', () => {
        expect(keyFromUrl('/api/files/replays/room1-17.m4a')).toBe('replays/room1-17.m4a');
        expect(keyFromUrl('https://www.wordeth.com/api/files/audio-messages/a%20b.webm?x=1')).toBe('audio-messages/a b.webm');
        expect(keyFromUrl('avatars/64abc.jpg')).toBe('avatars/64abc.jpg');
        expect(keyFromUrl('https://cdn.elsewhere.com/pic.jpg')).toBeNull();
        expect(keyFromUrl('')).toBeNull();
    });
    test('all go, and one that will not does not stop the rest', async () => {
        const out = await flushAccountFiles({ userId: '64abc', urls: ['/api/files/replays/room1-17.m4a', '/api/files/replays/missing.m4a', '/api/files/replays/room1-17.m4a', null] });
        expect(fileStorage.deleteByPrefix).toHaveBeenCalledTimes(5);
        expect(fileStorage.deleteByKey).toHaveBeenCalledTimes(2);
        expect(out).toEqual({ byPrefix: 10, byUrl: 1, failed: 0 });
    });
});
