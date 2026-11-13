# ADR-0070: A Replayed Dead Letter That Fails Again Reopens Its Entry

**Status:** Accepted
**Date:** 2026-11
**Amends:** [ADR-0043](./0043-message-delivery-once-per-subscribed-service.md) (§7: deduplication on `<messageId>:<service>`)
**Related:** issue #1005, issue #531
**Verified by:** `services/dlq-service/tests/db/claims.db.spec.ts`, `tests/e2e/dead-letter-flow.e2e.spec.ts`

## Context

ADR-0043 §7 replays an entry that has a `service` through `POST /message/replay`, under its original `messageId`. When the subscriber fails again, message-manager dead-letters the message under the same `messageId`, so dlq-service computes the same dedup key `<messageId>:<service>`. The unique index `{ messageId: 1 }` holds one document per key: the new failure was taken for a duplicate and dropped, while the entry stayed `completed`. The ping-pong count (`dlqPassCount`) never passed 1 for such entries. Until issue #1005 every entry was broadcast through `POST /message` under a new `messageId`, which hid the defect. Option 1 of the issue, validated by the owner on 2026-11-13.

## Decision

1. **A new failure reopens the entry.** `DlqEntryWriter` looks the key up first. If the entry is `completed`, or claimed by a replay still in flight, the failure reopens it: pending again, `dlqPassCount` + 1, fresh `reason` / `deliveryAttempt`, `retryCount` 0, completion fields and claim removed. Removing the claim makes the completion of the in-flight replay miss the entry (it filters on `processingInstance`).
2. **Ping-pong applies on reopen.** At `DLQ_MAX_PASS_COUNT` passes the reopened entry is `abandoned`, as a new entry would be.
3. **Otherwise unchanged.** A pending entry with the key is the same failure delivered twice: its id is returned, nothing changes. An abandoned entry stays abandoned. Entries without `service` are replayed under a new `messageId` and never collide.

## Alternatives Considered

- **One entry per pass** (key `<messageId>:<service>:<pass>` or a partial unique index): full history, but an index migration (expand / contract) and a dedup that must skip completed entries. Rejected: highest cost.
- **Replay under a new `messageId`**: contradicts ADR-0043 §7 and breaks subscriber idempotence on `messageId`. Rejected.

## Consequences

- One document per `(message, service)`; the history of its passes is the counter `dlqPassCount`, not separate documents.
- Each reopen still publishes `dlq.entry.added` with the entry id, so the audit trail records every pass.
- A late duplicate of a failure already replayed reopens the entry: one extra targeted replay, absorbed by subscriber idempotence (ADR-0043 §6).
