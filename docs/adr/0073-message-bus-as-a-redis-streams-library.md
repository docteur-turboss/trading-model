# ADR-0073: The Message Bus as a Redis Streams Library, Dead Letters in Dead Streams

**Status:** Accepted
**Date:** 2026-11
**Supersedes:** [ADR-0048](./0048-durable-message-journal-in-redis-streams.md), [ADR-0043](./0043-message-delivery-once-per-subscribed-service.md)
**Verified by:** `packages/broker-message/tests/unit/bus/bus.spec.ts`, `packages/broker-message/tests/unit/bus/redis-journal.spec.ts`, `packages/broker-message/tests/unit/bus/backoff.spec.ts`, `packages/broker-message/tests/unit/bus/delivery-error-classifier.spec.ts`, `packages/broker-message/tests/db/bus-library.db.spec.ts`, `services/message-manager/tests/db/redis-message-journal.db.spec.ts`, `services/audit-logger/tests/unit/dlq-cli.spec.ts`, `bun run test:contract`, `tests/alerts/alerting.test.yml`
**Related:** [ADR-0046](./0046-simplification-trajectory.md) (step 4), [ADR-0047](./0047-redis-isolation-per-service.md) (ACL users), [ADR-0059](./0059-scoped-api-keys-and-dlq-actor.md) (DLQ scopes), [ADR-0070](./0070-replayed-dead-letter-reopens-its-entry.md), [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md) (DLQ auto-retry), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand/contract), issues #1202, #1211

Accepted with release N (issue #1240): it supersedes ADR-0048 (journal, groups, retries, backoff and limits: kept, moved into the library) and ADR-0043 (once per service: kept), and the DLQ parts of ADR-0029, ADR-0059 and ADR-0070 once release N+1 removes dlq-service.

## Context

ADR-0048 already made Redis Streams the journal of the bus: one stream per topic, one consumer group per subscriber service, retries and crash recovery from the pending list (`XPENDING`, `XCLAIM`). message-manager only adds an HTTP hop around it: publishers `POST /message`, it `XADD`s, its workers `XREADGROUP` and `POST` the callback of each subscriber service, then dead letters go to dlq-service (MongoDB replica set `mongo-dlq`, Redis list `dlq:queue`, automatic replay). message-manager (2 454 lines), dlq-service (4 146) and `packages/broker-message` (1 136) carry one business flow: scraper → trainer → evaluator, every topic also to audit-logger.

The owner chose on 2026-11-15 (issue #1202): **Redis Streams used as a library** (no broker service, no new infrastructure), the journal **in the shared HA Redis**, and dead letters in **dead streams** with dlq-service retired.

## Decision

0. **Keys.** The bus keeps the keys message-manager writes today (`trading-model:message-manager:journal:<topic>`, `…:journal-groups`); dead streams are `trading-model:message-manager:dead:<topic>`. Renaming a stream under traffic loses entries, so the prefix stays even after message-manager is gone.
1. **Publish** is an `XADD` by the publisher itself, through the shared bus package, into the journal stream of the topic; the groups already exist, created by the subscribers (2). The envelope, `messageId`, `emittedAt`, `traceparent` and the delivery modes of ADR-0048 are unchanged. A topic whose stream has no group (`XINFO GROUPS`, cached briefly) drops the message and counts it (`requireSubscriber` refuses), as today.
2. **Subscribe** is declaring the topics at start: the service creates its consumer group (`XGROUP CREATE … MKSTREAM`, idempotent) and registers it in the `journal-groups` set. No subscription hash, no TTL, no `POST /subscribe`: a group exists until removed by an operator, so messages wait for a service that is down (bounded by the stream trim of ADR-0048, 24 h).
3. **Consume** runs in each subscriber process: one loop per topic, `XREADGROUP` for new entries, `XPENDING` + `XCLAIM` for due retries with the backoff of ADR-0048 (1 s base, 20 s cap, jitter), the handler called in process, `XACK` on success. Every replica of the service is a consumer of the same group: delivery stays once per service, at least once, deduplicated on `messageId` by the subscribers. No callback route, no HTTP between publisher and subscriber.
4. **Dead letters.** An entry whose delivery count reaches the mode's limit (10 for `at-least-once`) is copied to the dead stream `<prefix>:dead:<topic>` with its group, attempts and last error, then acknowledged in the journal (`MULTI`/`EXEC`, one step). Dead streams are never trimmed by the library; their length is a metric (`bus_dead_letters`) with an alert. Replay = `XADD` back into the journal for that group only, then `XDEL` from the dead stream; delete = `XDEL`. Both go through an operator CLI (a `bin` of a service, like audit-logger's `chain-cli`), never through the gateway, and publish the `dlq.*` audit events (`dlq.replay.completed`, `dlq.entries.deleted`, `dlq.entry.added` when dead-lettered) so audit-logger keeps the trail; the actor is the operator name given to the CLI.
5. **Redis.** The shared HA Redis (Sentinel, AOF, `JOURNAL_MIN_REPLICAS`) keeps the journal; `maxmemory-policy noeviction` is set explicitly in `redis-ha.sh` and compose (no `maxmemory` today, so Redis already never evicts; writes fail instead, which the publisher reports). One ACL user per service that publishes or consumes, restricted per stream (issue #1620): write on the `journal:<topic>` of the topics it publishes, read and acknowledge on those it subscribes to, topics from `EVENT_PUBLISHERS` / `EVENT_SUBSCRIBERS` of `@trading-model/contracts/event-routes`; the consumer drops and counts (`bus_publisher_rejected_total`) an entry whose `publisher` is not a publisher of its topic (ADR-0047); only `XGROUP CREATE` is granted. Known limit: Redis does not filter the group argument, so two subscribers of one topic (audit-logger and model-evaluator on `training.model.published`) can `XACK` / `XCLAIM` each other's group; the users `message-manager` and `dlq-service` go.
6. **Removed:** message-manager, dlq-service and their manifests, SPIRE entries, compose services, its runbooks and its dashboards, but the bus keeps its delivery, journal and dead-letter metrics and alerts (`mm_messages_delivered_total`, `mm_messages_dlq_total`, `mm_journal_*`, `bus_dead_letters`), now emitted by the library consumer, whose handlers run in the publisher trace (issue #1439); the `mongo-dlq` replica set with its users, backups, exporter and restore steps; the callback routes (`POST /message` of every subscriber); the public `/v1/dlq-service/*` routes and the `dlq:write` scope; the DLQ auto-retry (issue #1211 becomes moot).

### Releases (ADR-0040)

- **N (expand), as shipped:** `packages/broker-message/src/bus/` (publisher, consumer, journal, dead streams); a service chooses its transport with `BUS_TRANSPORT` (`library` | `http`, issue #1986, `busJournalFromEnv`): `library` without `REDIS_*` settings refuses to start, `http` keeps the HTTP path, unset keeps the first rule of N (library when `REDIS_*` is set) for an N-1 still running; the operator CLI is `audit-dlq` of audit-logger (`dlq-cli.js <operator> list|replay|delete`); message-manager keeps its workers and callback routes and dead-letters into the dead streams (`bus_dead_letters`, alert `BusDeadLetters`); `POST /dlq` of dlq-service is gone (its MongoDB entries are read, replayed and deleted through the API only) and its auto-retry is off (`DLQ_AUTO_RETRY_ENABLED` unset). The ACL users of the bus services exist when their `REDIS_<SERVICE>_PASSWORD` key is set.
- **N (expand), plan:** the library writes and reads the existing journal keys of message-manager (same streams, same groups, same entry format), so message-manager workers and in-process consumers share each group: a message goes to one of them, never both. Publishers `XADD` directly; subscribers start consuming in process and keep their callback route for message-manager. message-manager dead-letters into the dead streams instead of `POST /dlq`; dlq-service stops its auto-retry and serves its MongoDB entries read-only, for replay through the CLI or deletion.
- **N+1 (contract):** message-manager, dlq-service, `mongo-dlq`, the callback routes and the subscription hashes (`…:subscriptions:<topic>`) go. Entries left in MongoDB are exported to the dead streams by a one-shot step of N+1 before the replica set is deleted.

## Consequences

- About 7 700 lines and three deployments fewer (message-manager, dlq-service, `mongo-dlq`), no HTTP hop and no SPIFFE ACL between publishers, broker and subscribers on the bus path.
- Every bus user needs Redis credentials and TLS (today only message-manager has them for the bus); Redis is the one failure domain of the bus, as it already is for the journal.
- Dead letters live in Redis, protected like the journal (AOF + replicas), no longer in a backed-up MongoDB: a total loss of Redis loses them with the undelivered messages (stated in ADR-0048 for the journal).
- Operators replay and delete with a CLI inside the cluster, not through the public API.
- Subscribers do their own retries: a slow handler holds its own consumer, not a shared broker worker.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| NATS JetStream | Native dead-lettering, but a new StatefulSet to run, secure, monitor and back up (owner, #1202) |
| RabbitMQ with DLX | Mature dead-lettering, heavier to run (owner, #1202) |
| Status quo (message-manager + dlq-service) | Keeps 7 700 lines for one flow (owner, #1202) |
| Dedicated Redis for the journal | A second HA Redis to run for no isolation need yet (owner, #1202) |
| Keep dlq-service (MongoDB, manual replay) | Keeps a service and a replica set for a list Redis can hold (owner, #1202) |
| dlq-service as a thin API over the dead streams | A service kept only to expose what a CLI does without the public attack surface |
