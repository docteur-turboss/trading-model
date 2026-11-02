# ADR-0019: Message Broker As Built — HTTP Pub/Sub Without Message Persistence

**Status:** Accepted
**Date:** 2026-10
**Supersedes:** [ADR-0002](./0002-redis-pub-sub.md), [ADR-0008](./0008-message-broker-choice.md)
**Related:** [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) (removed the Redis Streams, WAL and Mongo archive code), [ADR-0016](./0016-shared-contracts-ownership.md) (message contracts)
**Verified by:** `services/message-manager/tests/unit/application/services/dispatcher.spec.ts`, `services/message-manager/tests/unit/domain/backoff-calculator.spec.ts`, `services/message-manager/tests/unit/adapters/outbound/subscription-stores.spec.ts`, `services/message-manager/tests/db/redis-subscription-store.db.spec.ts`, `services/message-manager/tests/unit/infrastructure/fallback/dlq-repository.spec.ts`, `services/message-manager/tests/unit/adapters/outbound/forwarding-dead-letter-store.spec.ts`, `services/message-manager/tests/unit/app/index.spec.ts`, `services/dlq-service/tests/unit/dlq-constants.spec.ts`, `bun run test:contract`, `tests/e2e/dead-letter-flow.e2e.spec.ts`

## Context

The 13.09 audit reported a continuous drift between the ADRs and the runtime. Checking it on 2026-10-28 found that ADR-0002 and ADR-0008, both still `Accepted`, describe a broker that does not exist:

| ADR-0002 / ADR-0008 say | The code does |
| --- | --- |
| Messages go through **Redis Streams** with consumer groups | No stream command anywhere. Redis only stores subscriptions (one hash per topic) |
| **MongoDB** keeps messages for audit and replay | message-manager has no MongoDB client. Nothing can be replayed |
| A **custom WAL** protects in-flight messages | No WAL. In-flight messages live in the process memory |
| "Mitigation: MongoDB persistence provides replay capability" | No replay |

The code was not lost by accident: ADR-0012 removed it on purpose (reachability analysis, "Redis Streams, WAL (file/redis), Mongo archive, WSS server … ~126 files"), because the runtime entry point never reached it. ADR-0012 did not mark ADR-0002 and ADR-0008 as superseded, so the documents kept describing guarantees the platform had stopped giving. Someone reading them during an incident would assume messages can be replayed from MongoDB and look for them there.

This ADR records the broker as it runs, so that its guarantees (and their absence) are explicit.

## Decision

**message-manager is a synchronous HTTP pub/sub broker. It keeps subscriptions, not messages.**

### Flow

```
Publisher ──POST /message──▶ message-manager ──POST /message (callback)──▶ each subscriber
                                   │
                                   ├── subscriptions: Redis hash per topic (TTL 60 s)
                                   └── dead letters ──POST /dlq (signed)──▶ dlq-service
                                         └── fallback: local JSON Lines file, forwarded later
```

1. **Publish.** `POST /message` validates the envelope (`PUBLISH_SCHEMA`), stamps `messageId` and `emittedAt`, then delivers it to every subscriber of the topic. The HTTP response is sent once every delivery has been acknowledged, dead-lettered or given up: the publisher waits for the retries. The request may last `PUBLISH_TIMEOUT_MS` (5 min, `@trading-model/contracts/publish-timeout`), which the worst-case retry budget must fit in (checked by a test); publishers wait 5 s longer and never re-send a publish once it left (`retryUnsentOnly`: only a refused connection is retried), since each copy would get a new `messageId`.
2. **Subscriptions.** `POST /subscribe` stores the binding in the `SubscriptionStorePort`. With Redis configured (`REDIS_SENTINELS` or `REDIS_URL`), it is a hash per topic, one field per instance, expiring 60 s after its last renewal; subscribers renew every 15 s (`broker-message`). Every replica reads the same store. Without Redis, the store is in memory: single replica only, lost on restart.
3. **No subscriber.** The message is dropped, logged and counted (`mm_messages_unrouted_total`). It is not kept for a later subscriber.
4. **Retries.** Delivery modes come from the message metadata (`@trading-model/contracts/delivery-mode`):
   - `at-least-once`: retried with exponential backoff (1 s base, 20 s cap, ±20 % jitter), up to 10 attempts of at most 10 s each (the HTTP client does not retry underneath), then dead-lettered: at most ~4.3 min per subscriber;
   - `at-most-once` and `exactly-once`: not retried. `exactly-once` is **not** an end-to-end guarantee: it relies on the subscriber being idempotent on `messageId` (as audit-logger is).
5. **Circuit breaker.** One breaker per subscription, local to each replica. While it is open, messages for that subscriber go straight to the dead letters.
6. **Dead letters.** Sent to dlq-service (`POST /dlq`, request signed with `DLQ_AUTH_HMAC_SECRET` as `message-manager`), where the DLQ API lists and replays them; production refuses to start without the secret. While dlq-service cannot take them, they are appended to a file local to the replica (`DLQ_LOCAL_FALLBACK_PATH`) and sent again every `DLQ_FORWARD_INTERVAL_MS` (1 min), at startup and at shutdown. In K8s the file is on an `emptyDir`: entries still in it when the pod is deleted without a graceful shutdown are lost (gauge `mm_dlq_fallback_pending`, alert `DeadLettersNotForwarded`). Entries dlq-service refuses for good (400, 413) go to `DLQ_LOCAL_FALLBACK_PATH.rejected` (alert `DeadLettersRejected`); a failure to write the file loses them (alert `MessagesLost`). A replay publishes the entry again through `POST /message` and waits for the answer like any publisher (`PUBLISH_TIMEOUT_MS` + 5 s, never re-sent once it left); its claim is only released as stale after `STALE_CLAIM_MS` (batch timeout + that wait + 1 min), or at shutdown when no replay is in flight, so an entry is not published twice while the first replay still runs. dlq-service publishes `dlq.entry.added`, `dlq.replay.completed` and `dlq.entries.deleted` on the bus for the audit trail; a dead letter of a `dlq.*` event publishes nothing (it would loop while audit-logger is down).
7. **Shutdown.** On SIGTERM the replica leaves discovery, keeps serving for `CACHE_TTL_MS` (publishers keep a resolved address that long), then waits up to `PUBLISH_TIMEOUT_MS` for in-flight publishes, then forwards its local dead letters. The pod's `terminationGracePeriodSeconds` (360 s) covers the whole sequence.

### Guarantees, stated plainly

| Property | Holds? |
| --- | --- |
| A message published while a subscriber is subscribed and reachable is delivered | Yes |
| A message survives a graceful message-manager restart (rolling deploy, SIGTERM) during delivery | Yes: in-flight deliveries finish first |
| A message survives a message-manager crash or kill during delivery | **No** (memory only) |
| A dead letter reaches the DLQ API | Yes, once dlq-service is reachable; lost if the pod is deleted before that |
| A message published with no subscriber is kept | **No** (dropped, counted), unless it sets `delivery.requireSubscriber`: then the publish is refused (503) and the publisher sends it again (scraper candles, publish cursor) |
| Messages can be replayed | **No** |
| Ordering | Not guaranteed across publishes (concurrent HTTP requests) |
| Subscriptions survive a restart / are shared between replicas | Yes with Redis, no without |

### When to revisit

The re-evaluation triggers of ADR-0008 still apply, rewritten against the real baseline:

- a consumer needs a message that was published while it was down (replay, durable delivery) → a persistent log is needed (Redis Streams, NATS JetStream or Kafka), not a patch on this broker;
- sustained throughput above ~1000 msg/s, or publishers that cannot afford to wait for delivery.

A change to any row of the guarantees table needs a new ADR that supersedes this one.

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| Restore the removed Redis Streams + WAL + Mongo archive | The code was never wired to the entry point and had no tests against real stores. Rebuilding it is a product decision with its own ADR, not a documentation fix |
| Edit ADR-0002 / ADR-0008 in place | ADRs are immutable once accepted (`docs/adr/README.md`): a superseding ADR keeps the history of what was believed and when |
| Move to Kafka / NATS now | Same reasons as ADR-0008 (operational cost, no current need for replay at this throughput). Listed as the path when a trigger above fires |

## Consequences

### Positive

- The documented guarantees match what the code does; an operator no longer looks for messages in a MongoDB archive that does not exist.
- The broker stays small: HTTP in, HTTP out, one Redis hash per topic.

### Negative

- Data loss on a broker restart or with no subscriber is now a documented property rather than a hidden one. The ingestion path (scraper → trainer) and the audit trail inherit it.
- Publishers block during retries (up to ~4.3 min, bounded by `PUBLISH_TIMEOUT_MS`).
- Dead letters dlq-service cannot take wait in replica-local files until it can.

### Follow-up

- Decide whether the trainer and the audit trail need durable delivery; if so, write the ADR that replaces this broker's storage.
- `bun run adr:check` (added with this ADR) requires every accepted ADR to name the check that proves it, and a superseded ADR to be pointed back at by its successor.
