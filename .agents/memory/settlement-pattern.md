---
name: Idempotent settlement pattern
description: How Wordeth does crash-safe token payouts without multi-document transactions
---
Pattern used by `services/settlement.js` for room tip-pool payouts; reuse for any future money-movement feature:
- One `SettlementEntry` per (room, recipient) with a unique compound index; a deterministic `payoutId` (sha256 of room+recipient).
- The credit is applied with a **single atomic User update**: `$inc` balance + `$push` payoutId, guarded by `settledPayoutIds: { $ne: payoutId }` — retries become no-ops, so a crash at any point is safe to replay.
- Close is claimed via `findOneAndUpdate(status: open -> closing)` so exactly one closer wins; `closing` is re-entrant for recovery.
- A background sweep retries stuck `closing` pools every 60s (unref'd timer, disabled in tests).
- Split allocation uses largest-remainder so integer payouts total the pool exactly.
**Why:** Mongo standalone (mongodb-memory-server in tests, possibly no replica set in prod) can't use multi-doc transactions; this pattern gives exactly-once credit semantics anyway.
**Ordering lesson from review:** persist the splits snapshot (RoomPool) BEFORE flipping the scheduled room to live, or a crash leaves a live room whose settlement silently pays only the host.
