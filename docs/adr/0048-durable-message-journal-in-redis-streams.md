# ADR-0048: Durable Message Journal in Redis Streams — Accept First, Deliver Afterwards

**Status:** Accepted
**Date:** 2026-11
**Supersedes:** [ADR-0019](./0019-message-broker-as-built.md)
**Related:** [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) (removed the earlier Redis Streams code), [ADR-0016](./0016-shared-contracts-ownership.md) (publish timeout contract), [ADR-0023](./0023-discovery-registry-in-redis.md) (no `KEYS`), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `services/message-manager/tests/integration/message-broker.integration.spec.ts`, `services/message-manager/tests/unit/application/services/dispatcher.spec.ts`, `services/message-manager/tests/unit/adapters/outbound/redis-message-journal.spec.ts`, `services/message-manager/tests/db/redis-message-journal.db.spec.ts`, `services/message-manager/tests/unit/domain/backoff-calculator.spec.ts`, `services/message-manager/tests/unit/adapters/inbound/broker-routes.spec.ts`, `services/message-manager/tests/unit/app/index.spec.ts`, `services/dlq-service/tests/unit/dlq-constants.spec.ts`, `packages/broker-message/tests/unit/message-manager-client.spec.ts`, `packages/broker-message/tests/unit/trace-context.spec.ts`, `tests/contract/trace-context.spec.ts`, `bun run test:contract`, `tests/e2e/dead-letter-flow.e2e.spec.ts`

## Context

ADR-0019 recorded the broker as it ran: `POST /message` answered once every subscriber had acknowledged, dead-lettered or given up, up to `PUBLISH_TIMEOUT_MS` (5 min), and nothing was persisted on the broker side. The architecture audit of 2026-11-06 (anomaly A3, issue #502) listed the consequences:

- the freshness of the candles the trainer receives depended on audit-logger, the slowest subscriber;
- while a publish was in flight for a symbol, the scraper published nothing else for it;
- a message-manager pod that died mid-retry lost the delivery for the topics without a publisher-side cursor (`training.model.published`, `dlq.*`);
- 5-minute connections weighed on the load balancers and skewed CPU-based autoscaling.

ADR-0019 named the trigger itself: a consumer that needs durable delivery, or publishers that cannot afford to wait, require "a persistent log (Redis Streams, NATS JetStream or Kafka), not a patch on this broker". The owner chose, on issue #502, Redis Streams with consumer groups in the existing Redis (option 1 of four; an external broker and a memory-only 202 were rejected).

## Decision

**Accepting a message and delivering it are two steps. `POST /message` answers `202 {"messageId"}` once the message is in a durable journal; delivery and retries run in workers, outside any request.**

```
Publisher ──POST /message──▶ message-manager ──XADD──▶ Redis stream "journal:<topic>"
              ◀── 202 ──────        (replica A)               │ one consumer group per subscriber service
                                                              ▼
                       workers of every replica ──XREADGROUP / XCLAIM──▶ POST callback ──▶ subscriber service
                                  │                                          │ XACK once delivered / dead-lettered
                                  └── dead letters ──POST /dlq (signed)──▶ dlq-service (file fallback kept)
```

1. **Accept.** `POST /message` validates the envelope, stamps `messageId` and `emittedAt`, and reads the live subscriptions of the topic. No subscriber: the message is dropped and counted (`mm_messages_unrouted_total`), or refused with 503 when it sets `delivery.requireSubscriber`, exactly as before. Otherwise, for every distinct subscriber **service** it makes sure the consumer group exists (`XGROUP CREATE … $ MKSTREAM`, so the group cannot miss the message; groups this process already created are cached, except when `EXISTS` on the stream returns 0, i.e. Redis lost it, which registers them again before the write), then writes the message once with `XADD` and answers 202. When `JOURNAL_MIN_REPLICAS` > 0 (K8s production: 1) it then runs `WAIT`; fewer replicas than required answer 503 and the publisher sends again; the entry just written is removed (`XDEL`) first, so the retry (a new `messageId`) is not delivered twice. A worker that read the entry in that instant still delivers it: that window is the only duplicate left, and it is closed only by the subscriber deduplicating. The request lasts `PUBLISH_ACCEPT_TIMEOUT_MS` (15 s) at most.
2. **Groups.** One stream per topic, one consumer group per subscriber service. A group outlives its subscribers: a message accepted for a service waits in its group while the service has no live subscription, and is delivered when it subscribes again. The set `…:journal-groups` lists the groups so that workers never use `KEYS` (ADR-0023). Delivery is **once per service**, not once per subscribed instance as with ADR-0019 (the target instance was already picked by the address manager; the duplicate sends are gone).
3. **Delivery.** Every replica runs one worker: a loop per group (groups listed every 2 s). While the group has a live subscription the loop takes over the entries whose retry is due (`XPENDING` then `XCLAIM`, atomic through MIN-IDLE: of two replicas, one wins), reads the new ones (`XREADGROUP > BLOCK 1000 COUNT 100`, on a connection of its own per group, so delivery follows the write within milliseconds), and delivers them to the subscriber (10 attempts max per entry, HTTP timeout 10 s, no HTTP client retry underneath). A slow subscriber holds back its own group only. Takeover of due retries (`claimDue`) is tried at most every 2 s and only when the blocking read returns (up to 1 s later), so a retry is picked up up to ~3 s after its due time. A batch of 100 entries is delivered in parallel to the same service: a backlog catch-up can hold 100 concurrent HTTP requests per group per replica (no concurrency cap yet).
4. **Retries.** The retry state is the stream's pending list: the number of deliveries and the idle time of each entry, shared by all replicas. An entry is retried once its idle time exceeds the attempt timeout plus the exponential backoff (1 s base, 20 s cap, ±20 % jitter) of its attempt count; delivery modes are unchanged (`at-least-once` retried up to 10 attempts then dead-lettered; `at-most-once`, `exactly-once` not retried). An entry is acknowledged (`XACK`) when it was delivered, dead-lettered or dropped. The per-subscriber circuit breaker stays local to each replica; while it is open the entry is left pending.
5. **Crash recovery.** A replica that dies leaves its entries pending; any other replica claims them once their retry is due (≤ ~30 s after the last attempt), and the attempt counter keeps counting. A crash between a successful delivery and its `XACK` delivers the message twice: delivery is **at-least-once**, subscribers deduplicate on `messageId` (audit-logger does).
6. **Durability.** The journal is Redis state that cannot be rebuilt. Production K8s runs Redis with `--appendonly yes` on Sentinel with replicas (`deploy/k8s/infra/redis.yaml`) and `JOURNAL_MIN_REPLICAS=1` (production overlay; staging has one Redis node, 0); message-manager refuses to start in production without `REDIS_URL` / `REDIS_SENTINELS`. Compose keeps `REDIS_APPENDONLY` per environment (default `no`); set it to `yes` wherever accepted messages matter. Entries older than 24 h are trimmed (`XADD MINID ~`), delivered or not; a trimmed entry still pending in a group is acknowledged by the worker that meets it (Redis < 7 keeps it in the pending list otherwise), after being counted (`mm_journal_trimmed_pending_total{topic,service}`) and logged at `error`; alert `JournalEntriesTrimmed` (critical) fires on any increase (ADR-0017: no silent loss). Follow-up: trim from `XPENDING` with a DLQ hand-off. Redis is still not backed up: the journal is covered by AOF and replication, not by `backup-lib.sh`.
7. **Dead letters** keep `POST /dlq` signed to dlq-service and `dlq.*` events not dead-lettered. *Amended by #910:* the replica-local file fallback is gone; when dlq-service refuses or cannot be reached, or while the subscriber's circuit breaker is open, the entry is not acknowledged and the journal retries it, so the journal is the only buffer of undelivered messages. A dlq-service replay publishes through `POST /message` and now gets its 202 at once (`REPLAY_DELIVERY_TIMEOUT_MS` = accept timeout + 5 s).
8. **Shutdown.** On SIGTERM the replica leaves discovery, keeps serving for `CACHE_TTL_MS`, closes the server (requests are short now), stops its worker and waits for the attempts in flight (≤ 10 s), then exits. Messages not yet delivered stay in the journal for the other replicas. `terminationGracePeriodSeconds` goes from 360 to 120 (collector: 60).
9. **Subscriptions** are unchanged (Redis hash per topic, 60 s TTL, renewed every 15 s); subscribing also registers the journal group. Without Redis (dev, tests) the subscriptions and the journal are in memory, single replica, lost on restart.
10. **Trace context** (issue #599). The publisher's broker client writes the W3C `traceparent` of its active span into `metadata.traceparent` (optional; absent when tracing is off). message-manager keeps it in the journal entry and sends each delivery in that context, so the subscriber's server span continues the publisher's trace although the delivery runs later, from another request. A malformed value is dropped, never a reason to refuse the message. Older publishers simply send none.

### Contract and rollout (expand/contract)

The publish response changes from `204` (after delivery) to `202 {"messageId"}` (after acceptance). Publishers never read the body and treat any 2xx as success, so the **old publishers already accept the new answer**; the new publishers also accept the old one and, in 3.0.0 only, kept the old bound (305 s) so that a publish to a still-old replica is not reported failed (nor opens the publisher circuit breaker, which the kind upgrade gate caught). The bound dropped to `PUBLISH_ACCEPT_TIMEOUT_MS` 15 s + 5 s in the next release (contract step); the broker side (15 s) and the grace periods already use the short value.

### Guarantees, stated plainly

| Property | Holds? |
| --- | --- |
| A publish answers independently of the subscribers' health | Yes: 202 after the journal write |
| An accepted message survives the loss of a message-manager replica, mid-retry included | Yes: the pending list is in Redis and any replica claims it |
| An accepted message survives a Redis master failover | Yes with `JOURNAL_MIN_REPLICAS ≥ 1` (K8s production); a single node with AOF loses at most the last second of writes |
| An accepted message survives the loss of Redis and its replicas | **No** (no backup of the journal) |
| Delivered exactly once | **No**: at least once, duplicates after a crash between delivery and `XACK`; subscribers deduplicate on `messageId` |
| Delivered once per subscriber service | Yes |
| A message accepted for a service with no live subscription waits for it | Yes, for 24 h |
| A message published with no subscriber is kept | **No** (dropped and counted, or refused with `requireSubscriber`) |
| Ordering | Not guaranteed (concurrent deliveries and retries) |
| A publisher knows its message was delivered | **No**: 202 means accepted. Failures end in dlq-service |

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| Hand-made journal in Redis (hash + due-time ZSET, locks) | Rewrites by hand what `XREADGROUP` / `XCLAIM` already guarantee, with more concurrency risk and no group notion |
| NATS JetStream or Kafka with an outbox in the publishers | New infrastructure to deploy, secure over SPIFFE, back up and monitor, out of proportion to the current throughput; the issue asked to reuse Redis. Remains the path if sustained throughput passes ~1000 msg/s |
| 202 with in-memory retries | Does not survive a crash and tells the publisher the message is safe when it is not: worse than ADR-0019 |

## Consequences

### Positive

- Publish latency no longer depends on the subscribers; the scraper's per-symbol publish gap shrinks from minutes to milliseconds; LB connections last milliseconds.
- Retries survive a pod loss and are visible in one place (the pending lists).
- One delivery per service, the base for the per-service delivery of issue #493.

### Negative

- Redis now carries state that cannot be recomputed: AOF and replication become requirements, and Redis memory (512 Mi in K8s) bounds the backlog of a subscriber that stays down (trimmed after 24 h).
- A publisher is no longer told that delivery failed; operators follow `mm_messages_dlq_total`, dlq-service and the journal backlog (`XPENDING`) instead.
- Dead consumer names of replaced pods stay in the groups (a few bytes each; no `XGROUP DELCONSUMER` yet).
- A group of a service that disappeared for good is polled forever (one cheap call per tick).

### Follow-up

- Alert on the journal backlog (oldest pending entry age) once there is a production baseline.
- `XGROUP DELCONSUMER` for stopped replicas, and per-service delivery to instances (#493), if needed.

## Amendment 2026-11 (issue #930): TLS

The journal and subscriptions travel over the Redis connection of ADR-0047: clear text and TLS in release N, TLS only from N+1 (`REDIS_TLS_MODE`, `docs/deployment/REDIS_TLS.md`). Replication to the `JOURNAL_MIN_REPLICAS` replicas is encrypted from N+1 (`tls-replication yes`).
