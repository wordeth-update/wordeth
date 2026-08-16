/**
 * Crash-safe settlement tests.
 *
 * Uses an in-memory MongoDB so these run everywhere. Simulates crashes
 * between every step of the settlement procedure and asserts that the
 * recovery sweep completes payouts exactly once, and that concurrent
 * double-close yields exactly one payout.
 */
require('./setup');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const User = require('../models/User');
const RoomPool = require('../models/RoomPool');
const SettlementEntry = require('../models/SettlementEntry');
const TokenLedger = require('../models/TokenLedger');
const settlement = require('../services/settlement');

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

afterEach(async () => {
    await Promise.all([
        User.deleteMany({}), RoomPool.deleteMany({}),
        SettlementEntry.deleteMany({}), TokenLedger.deleteMany({})
    ]);
});

async function makeUser(name, tokenBalance = 0) {
    return User.create({
        name, email: `${name}@test.com`, password: 'password123', tokenBalance
    });
}

async function makePool(roomId, host, collabs = [], balance = 0, status = 'open') {
    const splits = [{ userId: host._id, splitPercent: 100 - collabs.reduce((s, c) => s + c.pct, 0) }]
        .concat(collabs.map(c => ({ userId: c.user._id, splitPercent: c.pct })));
    return RoomPool.create({ roomId, hostUserId: host._id, splits, balance, status });
}

describe('tipping', () => {
    test('atomic debit credits the pool and rejects insufficient balance', async () => {
        const host = await makeUser('host');
        const tipper = await makeUser('tipper', 50);
        await makePool('room1', host);

        const ok = await settlement.tipRoom({ roomId: 'room1', user: tipper, amount: 30, hostUserId: host._id });
        expect(ok.ok).toBe(true);
        expect(ok.balance).toBe(20);
        expect((await RoomPool.findOne({ roomId: 'room1' })).balance).toBe(30);

        const broke = await settlement.tipRoom({ roomId: 'room1', user: tipper, amount: 100, hostUserId: host._id });
        expect(broke.ok).toBe(false);
        expect(broke.code).toBe(402);
        expect((await User.findById(tipper._id)).tokenBalance).toBe(20);
    });

    test('tips are rejected after the pool closes, with refund compensation on races', async () => {
        const host = await makeUser('host');
        const tipper = await makeUser('tipper', 50);
        const pool = await makePool('room1', host, [], 10);
        await RoomPool.updateOne({ _id: pool._id }, { $set: { status: 'closing' } });

        const rejected = await settlement.tipRoom({ roomId: 'room1', user: tipper, amount: 10, hostUserId: host._id });
        expect(rejected.ok).toBe(false);
        // Balance untouched — rejected before debit
        expect((await User.findById(tipper._id)).tokenBalance).toBe(50);
    });

    test('debit is refunded when the pool closes between debit and credit', async () => {
        const host = await makeUser('host');
        const tipper = await makeUser('tipper', 50);
        await makePool('room1', host, [], 0, 'open');

        // Simulate the race: close the pool after tipRoom's open-check but
        // before the pool credit, by monkey-patching findOneAndUpdate once.
        const orig = RoomPool.findOneAndUpdate.bind(RoomPool);
        const spy = jest.spyOn(RoomPool, 'findOneAndUpdate').mockImplementationOnce((filter, update, opts) => {
            // This is the pool-credit call: flip status first so it misses
            return RoomPool.updateOne({ roomId: 'room1' }, { $set: { status: 'closing' } })
                .then(() => orig(filter, update, opts));
        });
        const res = await settlement.tipRoom({ roomId: 'room1', user: tipper, amount: 10, hostUserId: host._id });
        spy.mockRestore();

        expect(res.ok).toBe(false);
        expect((await User.findById(tipper._id)).tokenBalance).toBe(50); // refunded
        const refund = await TokenLedger.findOne({ userId: tipper._id, type: 'tip_refund' });
        expect(refund).toBeTruthy();
    });
});

describe('allocation', () => {
    test('integer payouts always total the pool exactly', () => {
        const splits = [
            { userId: 'a', splitPercent: 33.33 },
            { userId: 'b', splitPercent: 33.33 },
            { userId: 'c', splitPercent: 33.34 }
        ];
        for (const balance of [1, 10, 100, 101, 997]) {
            const alloc = settlement.allocate(balance, splits);
            expect(alloc.reduce((s, a) => s + a.amount, 0)).toBe(balance);
        }
    });
});

describe('settlement happy path', () => {
    test('pool is distributed per splits into earnings + ledger', async () => {
        const host = await makeUser('host');
        const collab = await makeUser('collab');
        await makePool('room1', host, [{ user: collab, pct: 40 }], 100);

        const result = await settlement.closeAndSettleRoom('room1');
        expect(result.settled).toBe(true);

        expect((await User.findById(host._id)).tokenEarnings).toBe(60);
        expect((await User.findById(collab._id)).tokenEarnings).toBe(40);
        expect((await RoomPool.findOne({ roomId: 'room1' })).status).toBe('settled');
        expect(await SettlementEntry.countDocuments({ roomId: 'room1', status: 'settled' })).toBe(2);
        expect(await TokenLedger.countDocuments({ type: 'room_split_payout' })).toBe(2);
    });

    test('empty pool settles cleanly with no payouts', async () => {
        const host = await makeUser('host');
        await makePool('room1', host, [], 0);
        const result = await settlement.closeAndSettleRoom('room1');
        expect(result.settled).toBe(true);
        expect(await SettlementEntry.countDocuments({})).toBe(0);
    });

    test('closing a room with no pool is a safe no-op', async () => {
        const result = await settlement.closeAndSettleRoom('ghost-room');
        expect(result.settled).toBe(false);
        expect(result.reason).toBe('no_pool');
    });
});

describe('crash recovery', () => {
    test('crash AFTER close, BEFORE planning entries — sweep completes payout', async () => {
        const host = await makeUser('host');
        const collab = await makeUser('collab');
        // Simulate: closer flipped open->closing then died
        await makePool('room1', host, [{ user: collab, pct: 50 }], 80, 'closing');
        await RoomPool.updateOne({ roomId: 'room1' }, { $set: { closedAt: new Date(Date.now() - 120000) } });

        await settlement.recoverInterruptedSettlements({ olderThanMs: 60000 });

        expect((await User.findById(host._id)).tokenEarnings).toBe(40);
        expect((await User.findById(collab._id)).tokenEarnings).toBe(40);
        expect((await RoomPool.findOne({ roomId: 'room1' })).status).toBe('settled');
    });

    test('crash AFTER planning, BEFORE applying credits — sweep applies exactly once', async () => {
        const host = await makeUser('host');
        await makePool('room1', host, [], 100, 'closing');
        await RoomPool.updateOne({ roomId: 'room1' }, { $set: { closedAt: new Date(Date.now() - 120000) } });
        // Entry planned but credit never applied
        await SettlementEntry.create({
            roomId: 'room1', recipientUserId: host._id,
            payoutId: settlement.payoutIdFor('room1', host._id),
            amount: 100, splitPercent: 100, status: 'unsettled',
            createdAt: new Date(Date.now() - 120000)
        });

        await settlement.recoverInterruptedSettlements({ olderThanMs: 60000 });

        expect((await User.findById(host._id)).tokenEarnings).toBe(100);
        expect(await SettlementEntry.countDocuments({ status: 'settled' })).toBe(1);
    });

    test('crash AFTER applying credit, BEFORE marking entry settled — retry is a no-op', async () => {
        const host = await makeUser('host');
        await makePool('room1', host, [], 100, 'closing');
        const payoutId = settlement.payoutIdFor('room1', host._id);
        // Credit already applied (payoutId marker present) but entry unsettled
        await User.updateOne({ _id: host._id }, { $inc: { tokenEarnings: 100 }, $push: { settledPayoutIds: payoutId } });
        const entry = await SettlementEntry.create({
            roomId: 'room1', recipientUserId: host._id,
            payoutId, amount: 100, splitPercent: 100, status: 'unsettled'
        });

        await settlement.applyEntry(entry);

        // NOT double-credited
        expect((await User.findById(host._id)).tokenEarnings).toBe(100);
        expect((await SettlementEntry.findById(entry._id)).status).toBe('settled');
        // No duplicate ledger row for the retry
        expect(await TokenLedger.countDocuments({ type: 'room_split_payout' })).toBe(0);
    });

    test('crash BEFORE marking pool settled — re-settle does not double-pay', async () => {
        const host = await makeUser('host');
        const pool = await makePool('room1', host, [], 100, 'closing');
        await settlement.settlePool(pool);
        expect((await User.findById(host._id)).tokenEarnings).toBe(100);

        // Simulate pool left in closing (crash before final mark) and re-run
        await RoomPool.updateOne({ _id: pool._id }, { $set: { status: 'closing' } });
        await settlement.settlePool(await RoomPool.findById(pool._id));

        expect((await User.findById(host._id)).tokenEarnings).toBe(100); // still exactly once
        expect((await RoomPool.findById(pool._id)).status).toBe('settled');
    });
});

describe('concurrent double-close', () => {
    test('two simultaneous closes yield exactly one payout', async () => {
        const host = await makeUser('host');
        const collab = await makeUser('collab');
        await makePool('room1', host, [{ user: collab, pct: 30 }], 200);

        await Promise.all([
            settlement.closeAndSettleRoom('room1'),
            settlement.closeAndSettleRoom('room1')
        ]);

        expect((await User.findById(host._id)).tokenEarnings).toBe(140);
        expect((await User.findById(collab._id)).tokenEarnings).toBe(60);
        expect(await SettlementEntry.countDocuments({ roomId: 'room1' })).toBe(2);
        expect(await TokenLedger.countDocuments({ type: 'room_split_payout' })).toBe(2);
    });

    test('sequential re-close after settle is a no-op', async () => {
        const host = await makeUser('host');
        await makePool('room1', host, [], 50);
        await settlement.closeAndSettleRoom('room1');
        const second = await settlement.closeAndSettleRoom('room1');
        expect(second.settled).toBe(false);
        expect((await User.findById(host._id)).tokenEarnings).toBe(50);
    });
});
