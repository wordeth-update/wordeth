const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');
const SettlementEntry = require('../models/SettlementEntry');
const TokenLedger = require('../models/TokenLedger');

/**
 * Crash-safe token pool settlement.
 *
 * Design (no multi-document transactions required):
 *  1. Close: pool status open -> closing via findOneAndUpdate — exactly one
 *     concurrent closer wins; the rest are no-ops.
 *  2. Plan: create one unique SettlementEntry per (roomId, recipient) with a
 *     payoutId. Unique index makes re-planning after a crash idempotent.
 *  3. Apply: for each unsettled entry, credit tokenEarnings AND push payoutId
 *     onto the recipient in ONE atomic update guarded by
 *     `settledPayoutIds: { $ne: payoutId }` — a retry after a crash between
 *     apply and mark is a no-op.
 *  4. Mark: set the entry settled. If we crash before this, the recovery
 *     sweep re-runs apply (no-op) and then marks it.
 *  5. Recovery sweep: periodically completes any unsettled entries and any
 *     pools stuck in `closing`.
 */

function payoutIdFor(roomId, recipientUserId) {
    // Deterministic so a re-plan after a crash generates the same marker
    return crypto.createHash('sha256')
        .update(`payout:${roomId}:${recipientUserId}`)
        .digest('hex')
        .slice(0, 32);
}

/** Tip tokens into an open room pool. Atomic debit, compensating refund if
 *  the pool credit fails. Rejects tips into non-open pools. */
async function tipRoom({ roomId, user, amount, hostUserId, scheduledRoomId = null, splits = null }) {
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
        return { ok: false, code: 400, message: 'Invalid tip amount' };
    }

    // Ensure a pool exists (lazily created on first tip)
    let pool = await RoomPool.findOne({ roomId });
    if (!pool) {
        if (!hostUserId) return { ok: false, code: 404, message: 'Room pool unavailable' };
        try {
            pool = await RoomPool.create({
                roomId,
                hostUserId,
                scheduledRoomId,
                splits: splits && splits.length ? splits : [{ userId: hostUserId, splitPercent: 100 }],
                status: 'open'
            });
        } catch (err) {
            if (err.code === 11000) pool = await RoomPool.findOne({ roomId });
            else throw err;
        }
    }
    if (!pool || pool.status !== 'open') {
        return { ok: false, code: 409, message: 'Tips are closed for this room' };
    }

    // Atomic debit — only succeeds if balance is sufficient
    const debited = await User.findOneAndUpdate(
        { _id: user._id, tokenBalance: { $gte: amt } },
        { $inc: { tokenBalance: -amt } },
        { new: true }
    ).select('tokenBalance');
    if (!debited) {
        return { ok: false, code: 402, message: 'Insufficient token balance' };
    }

    // Credit the pool; only while still open. If this fails, refund (compensation).
    let credited = null;
    try {
        credited = await RoomPool.findOneAndUpdate(
            { roomId, status: 'open' },
            { $inc: { balance: amt, tipCount: 1 } },
            { new: true }
        );
    } catch (err) {
        credited = null;
    }
    if (!credited) {
        await User.updateOne({ _id: user._id }, { $inc: { tokenBalance: amt } });
        await TokenLedger.create({
            userId: user._id, type: 'tip_refund', amount: amt,
            balanceBefore: debited.tokenBalance, balanceAfter: debited.tokenBalance + amt,
            roomId, metadata: { reason: 'pool_credit_failed' }
        }).catch(() => {});
        return { ok: false, code: 409, message: 'Room closed — tip refunded' };
    }

    await TokenLedger.create({
        userId: user._id, type: 'tip', amount: -amt,
        balanceBefore: debited.tokenBalance + amt, balanceAfter: debited.tokenBalance,
        roomId, metadata: { poolBalance: credited.balance }
    }).catch(err => console.error('[Settlement] tip ledger error:', err.message));

    return { ok: true, balance: debited.tokenBalance, poolBalance: credited.balance, tipCount: credited.tipCount };
}

/** Largest-remainder allocation so integer payouts total exactly the pool. */
function allocate(balance, splits) {
    const raw = splits.map(s => ({
        userId: s.userId,
        splitPercent: s.splitPercent,
        exact: balance * s.splitPercent / 100
    }));
    const floored = raw.map(r => ({ ...r, amount: Math.floor(r.exact) }));
    let remainder = balance - floored.reduce((sum, r) => sum + r.amount, 0);
    floored
        .map((r, i) => ({ i, frac: r.exact - r.amount }))
        .sort((a, b) => b.frac - a.frac)
        .slice(0, remainder)
        .forEach(({ i }) => { floored[i].amount += 1; });
    return floored;
}

/** Close a room's pool and settle it. Safe to call multiple times and from
 *  concurrent paths — exactly one payout occurs. */
async function closeAndSettleRoom(roomId) {
    // Step 1: exactly one closer flips open -> closing
    const pool = await RoomPool.findOneAndUpdate(
        { roomId, status: 'open' },
        { $set: { status: 'closing', closedAt: new Date() } },
        { new: true }
    );
    if (!pool) {
        // Either no pool (no tips) or another closer won / already settled.
        const existing = await RoomPool.findOne({ roomId });
        if (existing && existing.status === 'closing') {
            // A previous closer may have crashed — finish its work.
            return settlePool(existing);
        }
        return { settled: false, reason: existing ? existing.status : 'no_pool' };
    }
    return settlePool(pool);
}

/** Steps 2-4: plan entries, apply credits idempotently, mark settled. */
async function settlePool(pool) {
    const { roomId, balance, splits } = pool;

    if (balance > 0 && splits && splits.length) {
        const allocations = allocate(balance, splits).filter(a => a.amount > 0);

        // Step 2: plan — unique entries per (room, recipient); duplicates are no-ops
        for (const a of allocations) {
            try {
                await SettlementEntry.create({
                    roomId,
                    recipientUserId: a.userId,
                    payoutId: payoutIdFor(roomId, a.userId),
                    amount: a.amount,
                    splitPercent: a.splitPercent,
                    status: 'unsettled'
                });
            } catch (err) {
                if (err.code !== 11000) throw err;
            }
        }

        // Steps 3-4: apply + mark
        const entries = await SettlementEntry.find({ roomId, status: 'unsettled' });
        for (const entry of entries) {
            await applyEntry(entry);
        }
    }

    // Step 5 (terminal): mark pool settled
    await RoomPool.updateOne(
        { _id: pool._id, status: 'closing' },
        { $set: { status: 'settled', settledAt: new Date() } }
    );
    return { settled: true, balance };
}

/** Apply one settlement entry: atomic credit + idempotency marker, then mark. */
async function applyEntry(entry) {
    const before = await User.findOneAndUpdate(
        { _id: entry.recipientUserId, settledPayoutIds: { $ne: entry.payoutId } },
        { $inc: { tokenEarnings: entry.amount }, $push: { settledPayoutIds: entry.payoutId } }
    ).select('tokenEarnings');
    if (before) {
        // Credit applied for the first time — write the ledger row (best-effort)
        await TokenLedger.create({
            userId: entry.recipientUserId, type: 'room_split_payout', amount: entry.amount,
            balanceBefore: before.tokenEarnings, balanceAfter: before.tokenEarnings + entry.amount,
            roomId: entry.roomId, metadata: { payoutId: entry.payoutId, splitPercent: entry.splitPercent }
        }).catch(err => console.error('[Settlement] payout ledger error:', err.message));
    }
    // Whether we applied it now or a crashed run applied it earlier, mark settled
    await SettlementEntry.updateOne(
        { _id: entry._id, status: 'unsettled' },
        { $set: { status: 'settled', settledAt: new Date() } }
    );
}

/** Recovery sweep: finish interrupted settlements. */
async function recoverInterruptedSettlements({ olderThanMs = 60 * 1000 } = {}) {
    if (mongoose.connection.readyState !== 1) return { pools: 0, entries: 0 };
    const cutoff = new Date(Date.now() - olderThanMs);
    let poolsRecovered = 0, entriesRecovered = 0;

    // Pools stuck in `closing` — re-run the settle procedure end to end
    const stuckPools = await RoomPool.find({ status: 'closing', closedAt: { $lte: cutoff } }).limit(20);
    for (const pool of stuckPools) {
        try {
            await settlePool(pool);
            poolsRecovered++;
        } catch (err) {
            console.error(`[Settlement] recovery failed for pool ${pool.roomId}:`, err.message);
        }
    }

    // Orphan unsettled entries (e.g. crash after plan, pool already marked)
    const stuckEntries = await SettlementEntry.find({ status: 'unsettled', createdAt: { $lte: cutoff } }).limit(100);
    for (const entry of stuckEntries) {
        try {
            await applyEntry(entry);
            entriesRecovered++;
        } catch (err) {
            console.error(`[Settlement] recovery failed for entry ${entry.payoutId}:`, err.message);
        }
    }
    if (poolsRecovered || entriesRecovered) {
        console.log(`[Settlement] recovery sweep: ${poolsRecovered} pool(s), ${entriesRecovered} entry(ies)`);
    }
    return { pools: poolsRecovered, entries: entriesRecovered };
}

let sweepTimer = null;
function startRecoverySweep(intervalMs = 60 * 1000) {
    if (sweepTimer) return;
    sweepTimer = setInterval(() => {
        recoverInterruptedSettlements().catch(err =>
            console.error('[Settlement] sweep error:', err.message));
    }, intervalMs);
    sweepTimer.unref();
}
function stopRecoverySweep() {
    if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
}

module.exports = {
    tipRoom,
    closeAndSettleRoom,
    settlePool,
    applyEntry,
    allocate,
    payoutIdFor,
    recoverInterruptedSettlements,
    startRecoverySweep,
    stopRecoverySweep
};
