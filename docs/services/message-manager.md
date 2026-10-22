# message-manager — Message Manager (Broker)

Pub/sub message brokering service with configurable delivery guarantees.

## General Information

| Property         | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Service name     | `message-manager`                                         |
| Port (host)      | `8444`                                                             |
| Port (container) | `3000`                                                             |
| Dependencies     | common, validation, http, server-utils, crypto, address-manager, broker-message |
| Persistence      | None (in-memory dispatcher; local JSONL dead-letter file)             |
| Validation       | Zod (dedicated schemas)                                            |

## Messaging Model

- Topic-based publish/subscribe over HTTP
- Subscription registry with instance-level deduplication
- Three delivery semantics: `AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EXACTLY_ONCE`
- TTL-based message expiration with Dead Letter Queue routing (local JSONL file)
- Parallel dispatch to all subscribers of a topic
- No write-ahead log or archive: messages are dispatched in memory; undeliverable messages are written to a local JSONL dead-letter file

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

**Response:** `204 No Content`

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
| `EXACTLY_ONCE`  | Delivered exactly once (idempotent)                                           |

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
- **Retry with backoff**: `AT_LEAST_ONCE` retries up to 10 times with exponential backoff (1s base, 60s cap) and ±20% random jitter
- **Circuit breaker**: After 5 consecutive dispatch failures, new messages are routed directly to the Dead Letter Queue to prevent cascading failures; the breaker resets on the next successful delivery
- **Alerting**: Persistent delivery failures are logged at ERROR level with topic, service name, and attempt count
- **Dead Letter Queue**: Undelivered messages are written to a local JSON Lines file (`dead-letter-queue.jsonl` via `FileDlqRepository`)
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
        → Dead Letter (src/infrastructure/fallback/dlq-repository.ts → local JSONL file)
```

HTTP is the only transport: there is no WebSocket endpoint.

## Deployment

The service is bootstrapped via `createBootstrap()` which:

1. Starts the HTTPS server with mTLS
2. Mounts AddressManager routes (ping/health)
3. Mounts Broker routes (publish/subscribe/unsubscribe)
4. Initialises the AddressManager client in `onStart`
