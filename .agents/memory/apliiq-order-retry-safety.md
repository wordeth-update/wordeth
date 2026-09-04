---
name: Apliiq order retry safety
description: Safe retry boundaries for outbound production-order submissions when Apliiq does not provide a documented idempotency header.
---

Treat transport errors after an outbound order submission begins, and expired in-flight submission leases, as ambiguous outcomes requiring reconciliation or staff review. Do not automatically submit them again. Automatically retry only explicit provider responses that state the request failed, using backoff and the same stable external order ID.

**Why:** A connection timeout can occur after Apliiq has accepted an order but before Wordeth receives the response. Reposting then can create a second physical production order and a second charge.

**How to apply:** Atomically lease paid, open orders; recheck payment/cancellation state immediately before sending; map any successful provider response even if a refund raced with it; quarantine unknown-delivery outcomes until a provider lookup proves whether the order exists.