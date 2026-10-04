const { runsRoom, nextHost, managersOf } = require('../services/roomHosts');

function room() {
    return {
        hostId: 'h',
        participants: new Map([
            ['h', { socketId: 'h', isHost: true }],
            ['a', { socketId: 'a', isSpeaker: true }],
            ['c', { socketId: 'c', isSpeaker: true, isCoHost: true }],
        ]),
    };
}

describe('who runs a room', () => {
    test('the host and a co-host do; a speaker does not', () => {
        const r = room();
        expect(runsRoom(r, { id: 'h' })).toBe(true);
        expect(runsRoom(r, { id: 'c' })).toBe(true);
        expect(runsRoom(r, { id: 'a' })).toBe(false);
        expect(runsRoom(r, { id: 'stranger' })).toBe(false);
        expect(runsRoom(null, { id: 'h' })).toBe(false);
    });
    test('requests go to the host and every co-host', () => {
        expect(managersOf(room()).sort()).toEqual(['c', 'h']);
    });
    test('a co-host is first in line when the host goes', () => {
        const r = room();
        r.participants.delete('h');
        expect(nextHost(r).socketId).toBe('c');
        r.participants.get('c').isCoHost = false;
        expect(nextHost(r).socketId).toBe('a');
    });
});
