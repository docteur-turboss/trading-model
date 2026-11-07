# message-manager — Message Manager (Broker)

Pub/sub message brokering service with configurable delivery guarantees.

## General Information

| Property         | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Service name     | `message-manager`                                         |
| Port (host)      | `8444`                                                             |
| Port (container) | `3000`                                                             |
| Dependencies     | common, validation, http, server-utils, crypto, address-manager, broker-message |
| Persistence      | None (in-memory dispatcher; dead letters in dlq-service)              |
| Validation       | Zod (dedicated schemas)                                            |

## Messaging Model

- Topic-based publish/subscribe over HTTP
- Subscription registry with instance-level deduplication
- Three delivery semantics: `AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EXACTLY_ONCE` (single attempt, not an end-to-end guarantee: see [ADR-0048](../adr/0048-durable-message-journal-in-redis-streams.md))
- TTL-based message expiration with Dead Letter Queue routing (dlq-service)
- Parallel dispatch to all subscribers of a topic
- No write-ahead log or archive: messages are dispatched in memory; undeliverable messages are sent to dlq-service (local JSONL file while it is unreachable)

## REST Endpoints

### Publish a Message

**`POST /message`**

Publishes a message to a topic.

Body (validated by `PublishSchema`):

```json
{
  "payload": {
    "symbol": "BTCUSDT",
    "price": 50000.0,
    "volume": 12.5
  },
  "metadata": {
    "topic": "market.trade.recent.fetch",
    "eventType": "market.trade.recent.fetch",
    "schemaVersion": "1.0.0",
    "publisher": {
      "serviceName": "financial-scraper",
      "instanceId": "uuid-123"
    },
    "delivery": {
      "mode": "at-least-once",
      "ttl": 60000,
      "deduplicationId": "dedup-uuid"
    }
  }
}
```

**Response:** `202 Accepted` with `{ "messageId": "..." }`, once the message is written to the durable journal (Redis Streams, ADR-0048). Delivery and retries run afterwards, outside the request; `503` when the topic has no subscriber and `delivery.requireSubscriber` is set, or the journal could not hold the message.

### Subscribe to a Topic

**`POST /subscribe`**

Subscribes a consumer to a topic for receiving messages.

Body (validated by `SubscribeSchema`):

```json
{
  "topic": "market.trade.recent.fetch",
  "callbackPath": "message",
  "consumerIdentity": {
    "serviceName": "trader-trainer",
    "instanceId": "uuid"
  }
}
```

**Response:** `204 No Content`

### Unsubscribe from a Topic

**`DELETE /subscribe`**

Unsubscribes a consumer from a topic.

Body (validated by `UnsubscribeSchema`):

```json
{
  "topic": "market.trade.recent.fetch",
  "instanceId": "uuid"
}
```

**Response:** `204 No Content`

## Delivery Semantics

| Mode            | Description                                                                   |
| --------------- | ----------------------------------------------------------------------------- |
| `AT_MOST_ONCE`  | Delivered at most once (no retries)                                           |
| `AT_LEAST_ONCE` | Delivered at least once (retries with exponential backoff, up to 10 attempts) |
| `EXACTLY_ONCE`  | Single attempt, no retry; no duplicate only if the subscriber is idempotent on `messageId` ([ADR-0048](../adr/0048-durable-message-journal-in-redis-streams.md)) |

## Security Metadata

Messages can include an optional `security` block within metadata, containing:

- **`authContext`** — Structured authentication context with:
  - `subject` (string) — Authenticated user or service identifier
  - `roles` (string[]) — Assigned role identifiers
  - `tenantId` (string) — Tenant or partition identifier
- **`signature`** (string, optional) — Message integrity signature

Previously validated as `z.unknown()`, the `authContext` object is now strictly validated against this schema to align with the canonical `SecurityType` interface in `@trading-model/validation/domain/contracts/message.types`.

## Features

- **TTL**: Message expiration based on time-to-live configured in metadata
- **Retry with backoff**: `AT_LEAST_ONCE` retries up to 10 times (10s per attempt, no HTTP-client retry underneath) with exponential backoff (1s base, 20s cap) and ±20% random jitter; the retry state (attempts, last attempt) is the pending list of the journal, shared by the replicas: a retry is due once the previous attempt has timed out and its backoff passed, and any replica takes it over if the one that owned it died
- **Circuit breaker**: After 5 consecutive dispatch failures, new messages are routed directly to the Dead Letter Queue to prevent cascading failures; the breaker resets on the next successful delivery
- **Alerting**: Persistent delivery failures are logged at ERROR level with topic, service name, and attempt count
- **Dead Letter Queue**: Undelivered messages are sent to dlq-service (a `POST` to its `/dlq` route, signed with `DLQ_AUTH_HMAC_SECRET`). While it cannot take them they are kept in `DLQ_LOCAL_FALLBACK_PATH` and sent again every `DLQ_FORWARD_INTERVAL_MS`, at startup and at shutdown; entries refused for good (400, 413) go to `DLQ_LOCAL_FALLBACK_PATH.rejected`
- **Graceful shutdown**: on SIGTERM the instance leaves discovery, keeps serving for `CACHE_TTL_MS`, stops its delivery worker after the attempts in flight (10 s at most), then forwards its local dead letters; messages not delivered yet stay in the journal for the other replicas (K8s `terminationGracePeriodSeconds: 120`, compose `stop_grace_period: 2m`)
- **Durable journal**: one Redis stream per topic, one consumer group per subscriber service (delivery once per service, at least once); entries older than 24 h are trimmed; `JOURNAL_MIN_REPLICAS` replicas must hold a write before the 202 (`WAIT`); production needs Redis with AOF
- **Deduplication**: Via `deduplicationId` in delivery metadata
- **Partitioning**: Via `partitionKey` in routing metadata
- **Priority**: Via `priority` in routing metadata

## Internal Architecture

```
HTTP Routes (src/adapters/inbound/http.routes.ts)
  → Controllers (src/adapters/inbound/http.controller.ts)
    → Zod Schemas (src/adapters/inbound/validation/broker.schema.ts)
      → Dispatcher (src/application/services/dispatcher.ts)
        → Subscription Registry (src/application/services/subscription-registry.ts)
        → Delivery over HTTP (src/adapters/outbound/http-message-delivery.ts → POST to subscriber callback URLs)
        → Dead Letter (src/adapters/outbound/forwarding-dead-letter-store.ts
            → dlq-service: http-dead-letter-store.ts, signed POST /dlq
            → fallback: src/infrastructure/fallback/dlq-repository.ts, local JSONL file)
```

HTTP is the only transport: there is no WebSocket endpoint.

## Deployment

The service is bootstrapped via `createBootstrap()` which:

1. Starts the HTTPS server with mTLS
2. Mounts AddressManager routes (ping/health)
3. Mounts Broker routes (publish/subscribe/unsubscribe)
4. Initialises the AddressManager client in `onStart`
