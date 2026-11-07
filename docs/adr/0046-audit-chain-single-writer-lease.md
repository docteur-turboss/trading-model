# ADR-0046: One Writer at a Time on the Audit Chain Head (Lease)

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) (chain, verifier and anchors stay as they are), [ADR-0043](./0043-message-delivery-once-per-subscribed-service.md)
**Verified by:** `services/audit-logger/tests/unit/persistence/audit-repository.spec.ts`, `services/audit-logger/tests/db/audit-contention.db.spec.ts`

## Context

Every audit write extends one hash chain (`chainSequence`, unique index). Replicas raced for the next sequence and retried on a duplicate key, at most `MAX_CHAIN_ATTEMPTS = 5` times. Measured on a Mongo replica set (40 simultaneous inserts per writer, issue #496):

| Writers | Events | Stored | Lost | Retries |
| --- | --- | --- | --- | --- |
| 2 | 80 | 80 | 0 | 0 |
| 5 | 200 | 154 | 46 (23 %) | 248 |

audit-logger runs under an HPA of 2 to 5 replicas, so a burst could lose audit events.

## Decision

1. **A Mongo lease serialises the replicas.** Document `_id: "head"` in `audit_chain_lease` (`owner`, `expiresAt`). A replica takes it by an upsert whose filter only matches an expired lease: a held lease makes the upsert hit the `_id` index (duplicate key), so there is no race. The holder reads the tail, hashes and inserts, then releases it.
2. **The lease is held per append, not per leader.** The owner chosen in option 1 of the issue was a long-lived single writer; forwarding events from other replicas to it needs a new inter-replica channel. Taking the lease around each append gives the same guarantee (one writer on the head at a time) with no forwarding and no failover gap. A replica that waits polls every 20-40 ms, for at most 30 s, then fails the insert with an error.
3. **TTL 10 s.** A holder that dies mid-append blocks the others for at most 10 s. The unique index on `chainSequence` and the retry loop stay as the safety net if a lease expires under a slow holder; `audit_chain_sequence_collisions_total{outcome}` counts them and should stay at 0.
4. **Chain, verifier, `chain-cli` and S3 anchors are unchanged.** Same collections, same hashes, same sequences. `audit_chain_lease` is operational state: never edit it by hand, and it is not part of the trail.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Long-lived leader with forwarding | Needs an inter-replica channel and failover; same guarantee as the per-append lease |
| Partitioned chains with a Merkle root of heads | Linear throughput, but verifier, `chain-cli` and anchors to rewrite |
| More retries, backoff, `$inc` counter | The counter remains a single serialisation point; sequence gaps break the verifier |
| Status quo, alert and `maxReplicas: 2` | Gives up availability above 2 replicas |

## Consequences

- No event lost to contention: 2 and 5 writers store every event (0 retries, 0 failures in `audit-contention.db.spec.ts`).
- Throughput is bounded by one append at a time, whatever the replica count (about 8-10 events/s locally with 80-200 simultaneous inserts, including lease polling). It does not grow with replicas. If volume ever exceeds this, partitioned chains become the next step (new ADR).
- One extra Mongo round trip pair (acquire, release) per event.
