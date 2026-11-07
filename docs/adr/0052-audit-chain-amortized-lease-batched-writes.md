# ADR-0052: Amortized Audit Chain Lease and Batched Writes

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0050](./0050-audit-chain-single-writer-lease.md) (amended: decision 2 superseded; decisions 1, 3, 4 stand), [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) (chain, verifier and anchors unchanged)
**Verified by:** `services/audit-logger/tests/unit/persistence/audit-repository.spec.ts`, `services/audit-logger/tests/db/audit-contention.db.spec.ts`

## Context

ADR-0050 took the lease around each append: acquire, read the head, `insertOne`, release, so 4 Mongo round trips per event and about 9 events/s whatever the number of replicas (issue #557). audit-logger listens to every topic.

Measured on a Mongo replica set (Testcontainers, 40 events per writer, all inserted at once, `audit-contention.db.spec.ts`):

| Writers | Events | Before (per-event lease) | After (amortized lease) |
| --- | --- | --- | --- |
| 1 | 40 | not measured | 102 events/s |
| 2 | 80 | 9 events/s | 77 events/s |
| 5 | 200 | 9 events/s | 79 events/s |

Single local run, indicative only; absolute numbers depend on the Mongo latency.

## Decision

1. **The lease is held while the queue is not empty.** A replica acquires it when its first write is queued, renews it (`owner` must still match and the lease must not be expired) before every batch, and releases it when the queue is empty. A failed renewal means a takeover: the cached tail is dropped and the lease is acquired again.
2. **Writes are batched.** Up to 100 queued events are chained in memory and stored with one ordered `insertMany` (`ignoreUndefined`, as hashed). The chain tail is read once per lease and kept in memory while the lease is held.
3. **Safety net unchanged.** The unique index on `chainSequence` still stops a holder whose lease expired (frozen past `LEASE_TTL_MS`): its stale batch collides, the tail is dropped, the events go back to the front of the queue and the loop renews or re-acquires the lease. `audit_chain_sequence_collisions_total{outcome}` still counts these (5 collisions on the same event = `exhausted`, the event fails).
4. **Duplicates.** A duplicate `messageId` in the middle of a batch leaves the events before it stored; it is counted `duplicate` (no chain break) and the events after it are re-chained after the last stored one.
5. **Metrics, verifier, `chain-cli`, anchors unchanged.** `audit_events_stored_total` is still incremented once per event.

## Consequences

- About 2 Mongo round trips per batch instead of 4 per event; throughput about 8x higher and flat from 1 to 5 replicas in the test.
- A replica that holds the lease keeps others waiting while its queue is non-empty (they poll up to `LEASE_WAIT_MS`, as before). Under a sustained flow on one replica the others write little; the total throughput is the same.
- Still one writer at a time: partitioned chains stay the next step above the measured ceiling (new ADR).
