const { agoraUidFor } = require('../services/agoraUid');

describe('agoraUidFor', () => {
    test('the same account in the same room keeps its number across sockets', () => {
        const a = agoraUidFor('room1', { userId: 'u1', socketId: 'sockA' });
        const b = agoraUidFor('room1', { userId: 'u1', socketId: 'sockB' });
        expect(a).toBe(b);
        expect(Number.isInteger(a) && a > 0).toBe(true);
    });
    test('different people and different rooms get different numbers', () => {
        const a = agoraUidFor('room1', { userId: 'u1', socketId: 's' });
        expect(agoraUidFor('room1', { userId: 'u2', socketId: 's' })).not.toBe(a);
        expect(agoraUidFor('room2', { userId: 'u1', socketId: 's' })).not.toBe(a);
    });
    test('a guest, whose user id is their socket id, is numbered by socket', () => {
        const a = agoraUidFor('room1', { userId: 'sockA', socketId: 'sockA' });
        const b = agoraUidFor('room1', { userId: 'sockB', socketId: 'sockB' });
        expect(a).not.toBe(b);
    });
    test('a number already held is kept', () => {
        const p = { userId: 'u1', socketId: 's', agoraUid: 4242 };
        expect(agoraUidFor('room1', p)).toBe(4242);
    });
});
