'use strict';

/**
 * A battle: two people on the stage, the crowd votes, one wins.
 *
 * The room's copy is the only one that counts. Phones used to tally the
 * votes they happened to hear, so a phone that arrived late saw zero,
 * a phone could vote as often as it liked, and nobody was ever told who
 * won. Now the server keeps one vote per account (per socket for a
 * guest), refuses the two contestants, stops counting when the clock
 * runs out, and announces the result.
 */

function start(data, now = Date.now()) {
    const b = data && data.battle;
    if (!b || typeof b !== 'object') return null;
    const side = (s) => (s && typeof s.socketId === 'string' && typeof s.name === 'string')
        ? { socketId: s.socketId, name: s.name.slice(0, 60) } : null;
    const a = side(b.a), c = side(b.b);
    if (!a || !c || a.socketId === c.socketId) return null;
    const endsAt = Number.isFinite(Number(b.endsAt)) && Number(b.endsAt) > now ? Number(b.endsAt) : null;
    return { id: String(b.id || `b${now.toString(36)}`).slice(0, 40), a, b: c, endsAt, startedAt: now, votes: {}, settled: false };
}

/** Everything a phone may know: who, when, and the tallies — never who voted for whom. */
function publicView(battle) {
    if (!battle) return null;
    return { id: battle.id, a: battle.a, b: battle.b, endsAt: battle.endsAt, votes: tally(battle) };
}

function tally(battle) {
    let a = 0, b = 0;
    for (const side of Object.values(battle.votes || {})) { if (side === 'a') a++; else if (side === 'b') b++; }
    return { a, b };
}

function isOver(battle, now = Date.now()) {
    return !!battle && (battle.settled || (battle.endsAt !== null && now >= battle.endsAt));
}

/**
 * One vote, from someone who is not on either side, while it is open.
 * Returns why not, or null when counted.
 */
function vote(battle, { voterKey, socketId, battleId, side }, now = Date.now()) {
    if (!battle || battle.id !== battleId) return 'no such battle';
    if (isOver(battle, now)) return 'the battle is over';
    if (side !== 'a' && side !== 'b') return 'no such side';
    if (socketId === battle.a.socketId || socketId === battle.b.socketId) return 'contestants do not vote';
    if (!voterKey) return 'no voter';
    if (battle.votes[voterKey]) return 'already voted';
    battle.votes[voterKey] = side;
    return null;
}

/** The result, once. A tie is a tie. */
function settle(battle) {
    if (!battle || battle.settled) return null;
    battle.settled = true;
    const votes = tally(battle);
    const winner = votes.a > votes.b ? 'a' : votes.b > votes.a ? 'b' : null;
    return { id: battle.id, a: battle.a, b: battle.b, votes, winner, winnerName: winner ? battle[winner].name : null };
}

module.exports = { start, publicView, tally, isOver, vote, settle };
