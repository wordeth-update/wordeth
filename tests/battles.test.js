const B = require('../services/battles');

function fresh(endsAt = null) {
    return B.start({ battle: { id: 'x', a: { socketId: 'sA', name: 'Ava' }, b: { socketId: 'sB', name: 'Ben' }, endsAt } }, 1000);
}

describe('battles', () => {
    test('one vote per voter, none from the contestants, tallied by the server', () => {
        const b = fresh();
        expect(B.vote(b, { voterKey: 'u1', socketId: 's1', battleId: 'x', side: 'a' })).toBeNull();
        expect(B.vote(b, { voterKey: 'u1', socketId: 's1', battleId: 'x', side: 'b' })).toBe('already voted');
        expect(B.vote(b, { voterKey: 'uA', socketId: 'sA', battleId: 'x', side: 'a' })).toBe('contestants do not vote');
        expect(B.vote(b, { voterKey: 'u2', socketId: 's2', battleId: 'y', side: 'a' })).toBe('no such battle');
        expect(B.vote(b, { voterKey: 'u2', socketId: 's2', battleId: 'x', side: 'b' })).toBeNull();
        expect(B.publicView(b).votes).toEqual({ a: 1, b: 1 });
        expect(B.publicView(b)).not.toHaveProperty('settled');
    });
    test('the clock closes the vote and the result names the winner, or a tie', () => {
        const b = fresh(5000);
        expect(B.isOver(b, 4999)).toBe(false);
        expect(B.vote(b, { voterKey: 'u1', socketId: 's1', battleId: 'x', side: 'b' }, 4999)).toBeNull();
        expect(B.vote(b, { voterKey: 'u2', socketId: 's2', battleId: 'x', side: 'a' }, 5000)).toBe('the battle is over');
        const r = B.settle(b);
        expect(r.winner).toBe('b'); expect(r.winnerName).toBe('Ben'); expect(r.votes).toEqual({ a: 0, b: 1 });
        expect(B.settle(b)).toBeNull();
        const t = fresh();
        expect(B.settle(t).winner).toBeNull();
    });
    test('a bad battle is refused', () => {
        expect(B.start({ battle: { a: { socketId: 's', name: 'x' }, b: { socketId: 's', name: 'y' } } })).toBeNull();
        expect(B.start({})).toBeNull();
    });
});
