# ADR-0072: Dead Letters Are Kept for Inspection and Manual Replay Only

**Status:** Accepted
**Date:** 2026-11
**Amends:** [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md) (`DLQ_AUTO_RETRY_ENABLED` row: no longer wired)
**Related:** issue #1211, [ADR-0070](./0070-replayed-dead-letter-reopens-its-entry.md)
**Verified by:** `bun run config:check`, `services/dlq-service/tests/db/auto-retry.db.spec.ts`

## Context

Two retry layers stack. message-manager exhausts its attempts with backoff, then dead-letters the message. dlq-service replayed it automatically through `POST /message`, which message-manager journals as a new message and retries from scratch (`delivery-executor.ts`, `delivery-worker.ts`): up to `DLQ_RETRY_MAX_ATTEMPTS` full broker cycles against a subscriber already failing. Owner decision on 2026-11-15: option 1 (two releases, expand/contract).

## Decision

1. **Release N (this one):** compose, the K8s ConfigMap and `.env.example` stop setting `DLQ_AUTO_RETRY_ENABLED` (code default `false`; `config:check` allows it unset). An entry stays in MongoDB until replayed by hand (`POST /dlq/replay`) or deleted. The code, Redis queue and claims stay, so a rollback to N-1 works.
2. **Release N+1:** remove the auto-retry, Redis queue and claim code and specs, the variable, `DLQ_RETRY_MAX_ATTEMPTS` if unread, and the dlq-service Redis user, `REDIS_DLQ_PASSWORD` and docs.
3. Retry stays with message-manager alone. `dlq.*` events are unchanged.

## Consequences

- Entries in the Redis queue are a cache of MongoDB: they are no longer read but stay in MongoDB, visible and replayable by hand.
- A backlog no longer drains by itself: the DLQ alerts stay firing until an operator replays or deletes ([runbook-dlq-backlog](../operations/runbooks/runbook-dlq-backlog.md)).
