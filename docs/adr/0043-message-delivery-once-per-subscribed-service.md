# ADR-0043: Message Delivery Once per Subscribed Service (Consumer Group)

**Status:** Accepted
**Date:** 2026-11
**Amends:** [ADR-0019](./0019-message-broker-as-built.md) (its "Subscriptions" and "Circuit breaker" items only; the HTTP broker without message persistence stands)
**Related:** [ADR-0023](./0023-discovery-registry-in-redis.md) (addresses resolved by service name), issue #493
**Verified by:** `services/message-manager/tests/unit/application/services/dispatcher.spec.ts`, `services/message-manager/tests/unit/application/services/subscription-registry.spec.ts`, `services/message-manager/tests/db/redis-subscription-store.db.spec.ts`, `services/message-manager/tests/unit/adapters/outbound/redis-message-journal.spec.ts`, `bun run test:contract`

## Context

The architecture audit of 2026-11-06 (anomaly A1, issue #493) found that message-manager mixed two identities:

- a subscription was stored and kept **per instance**: one Redis hash field per `instanceId`, one local `Subscription` (with its circuit breaker) per `topic|instanceId`;
- a delivery went **to the service name**: address-manager resolves the service, then replaces the host by its DNS name (`ServiceNameLocator`). In Kubernetes that name is the ClusterIP Service, and kube-proxy picks a pod.

With N subscribed instances, each message was posted N times to the Service, landing on random pods: some received it twice, others never. It was neither a fan-out to every instance nor a consumer group. Each circuit breaker tracked an instance while calling the Service, so its state matched no real pod. ADR-0019 did not say what a message does when a service runs several instances.

## Decision

**A message is delivered once to each subscribed service (consumer group). The Kubernetes Service picks the pod.**

1. The Redis store keeps one field per instance (`<prefix>:subscriptions:<topic>`, field `instanceId`, 60 s TTL renewed every 15 s). The field only tells whether the service is still subscribed. The format is the one every earlier release wrote: no migration.
2. The registry groups the live instances of a topic by `serviceName` and keeps one `Subscription` per `(topic, serviceName)`. Its callback path is the one of the first live instance read from the store.
3. One delivery per message and per subscribed service, to the service name. One circuit breaker per `(topic, serviceName)`, local to each replica: it tracks the address actually called.
4. An instance that unsubscribes (or stops renewing) does not stop the delivery while another instance of the same service stays subscribed; the circuit breaker state is kept.
5. `mm_subscription_count{topic}` counts subscribed services, that is deliveries per message.
6. Subscribers stay idempotent on `messageId`: retries can still deliver a message twice (ADR-0019, at-least-once).
7. **A dead letter is replayed to the one service whose delivery failed, under its original `messageId`** (issue #531). `DlqEntry.service` records that service (optional: entries written before it exist without it and are replayed through `POST /message` to every subscriber, as before). dlq-service replays an entry with a `service` through `POST /message/replay` of message-manager (callable by dlq-service only), which writes the stored message to the journal flagged for that service (`only` field of the stream entry, ADR-0048); the other groups settle the entry without delivering it. dlq-service deduplicates on `<messageId>:<service>` and counts ping-pong passes per `(content, service)`, so two subscribers failing on one message each keep a replayable entry.

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| Fan-out per instance, delivered to the registered IP (`IpAddressLocator`) | audit-logger would write every event once per pod; needs address-manager to resolve one given instance, SPIFFE mTLS and NetworkPolicy checks for pod-to-pod calls by IP, and the registered IP can be unreachable on a multi-network host. 1 to 2 days with a kind run |
| Semantics chosen by the subscriber (`group` / `broadcast` in `POST /subscribe`) | Cost of both options plus a contract change (`@trading-model/contracts`, `broker-message`). Close to the consumer groups of a durable broker, left to anomaly A3 |
| One Redis field per service holding the set of its instances | Same behaviour, but a new format to migrate and a read-modify-write race between replicas; grouping at read time needs neither |

The owner chose the consumer group on issue #493 (option 1).

## Consequences

### Positive

- No more random duplicates or misses: each subscribed service gets a message once per delivery attempt.
- audit-logger (HPA min 2) no longer writes each event once per pod.
- The circuit breaker state matches what is called.
- Change limited to the message-manager registry; the store format, the contracts and address-manager are unchanged.

### Negative

- With several trader-trainer pods (HPA 1 to 3), each pod sees only part of the candles: the in-memory buffer of a pod is incomplete. This is anomaly A2 (trainer state under HPA), out of scope here; staging pins the HPA at 1 pod, production does not.
- If instances of the same service subscribe with different callback paths (rolling upgrade that changes the path), one path is used for the whole service until the old instances leave.

### Follow-up

- A2: decide how trader-trainer shares its state across pods, or pin it to one pod.
- A3: a durable broker with native consumer groups would replace this grouping.
