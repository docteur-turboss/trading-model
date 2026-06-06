# message-manager — Message Manager (Broker)

Pub/sub message brokering service with delivery guarantees and MongoDB persistence.

## General Information

| Property         | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Service name     | `message-delivery-service`                                         |
| Port (host)      | `8444`                                                             |
| Port (container) | `3000`                                                             |
| Dependencies     | `@trading-model/common`, `@trading-model/address-manager`, MongoDB |
| Persistence      | MongoDB (planned — currently in-memory with Zod validation)        |
| Validation       | Zod (dedicated schemas)                                            |

## Messaging Model

- Topic-based publish/subscribe over HTTP
- In-memory subscription registry with instance-level deduplication
- Three delivery semantics: `AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EXACTLY_ONCE`
- TTL-based message expiration with Dead Letter Queue routing
- Parallel dispatch to all subscribers of a topic

## REST Endpoints

### Publish a Message

**`POST /api/messages/send`** or **`POST /message`**

Publishes a message to a topic.

Body (validated by `PublishSchema`):

```json
{
  "targetService": "trader-training-service",
  "payload": {
    "symbol": "BTCUSDT",
    "price": 50000.0,
    "volume": 12.5
  },
  "deliveryMode": "at-least-once",
  "metadata": {
    "topic": "market.trade.recent.fetch",
    "eventType": "market.trade.recent.fetch",
    "schemaVersion": "1.0.0",
    "publisher": {
      "serviceName": "financial-scrapper-service",
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

### Get Message

**`GET /api/messages/:id`**

Retrieves a single message by its ID.

**Response:** `200 OK`

```json
{
  "id": "msg-uuid-123",
  "metadata": {
    "topic": "market.trade.recent.fetch",
    "eventType": "market.trade.recent.fetch",
    "schemaVersion": "1.0.0",
    "publisher": {
      "serviceName": "financial-scrapper-service",
      "instanceId": "uuid-123"
    }
  },
  "payload": {
    "symbol": "BTCUSDT",
    "price": 50000.0,
    "volume": 12.5
  },
  "status": "delivered",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

### List Messages

**`GET /api/messages`**

Lists messages with optional filters.

**Query Parameters:**

- `status` — Filter by delivery status (`pending`, `delivered`, `failed`, `expired`)
- `limit` — Max results (default: 50)

**Response:** `200 OK`

```json
[
  {
    "id": "msg-uuid-123",
    "topic": "market.trade.recent.fetch",
    "status": "delivered",
    "createdAt": "2025-01-15T10:30:00Z"
  }
]
```

### Subscribe to a Topic

**`POST /subscription`**

Subscribes a consumer to a topic for receiving messages.

Body (validated by `SubscribeSchema`):

```json
{
  "topic": "market.trade.recent.fetch",
  "callbackPath": "message",
  "consumerIdentity": {
    "serviceName": "trader-training-service",
    "instanceId": "uuid"
  }
}
```

**Response:** `204 No Content`

### Unsubscribe from a Topic

**`DELETE /subscription`**

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

Previously validated as `z.unknown()`, the `authContext` object is now strictly validated against this schema to align with the canonical `SecurityType` interface in `@trading-model/common/contracts/message.types`.

## Features

- **TTL**: Message expiration based on time-to-live configured in metadata
- **Retry with backoff**: `AT_LEAST_ONCE` retries up to 10 times with exponential backoff (1s base, 60s cap) and ±20% random jitter
- **Circuit breaker**: After 5 consecutive dispatch failures, new messages are routed directly to the Dead Letter Queue to prevent cascading failures; the breaker resets on the next successful delivery
- **Alerting**: Persistent delivery failures are logged at ERROR level with topic, service name, and attempt count
- **Dead Letter Queue**: Undelivered messages persisted as JSON Lines (NDJSON) to `dead-letter-queue.jsonl` with failure reason, delivery attempt count, and timestamp
- **Deduplication**: Via `deduplicationId` in delivery metadata
- **Partitioning**: Via `partitionKey` in routing metadata
- **Priority**: Via `priority` in routing metadata

## Internal Architecture

```
HTTP Routes (http.routes.ts)
  → Controllers (http.controller.ts)
    → Zod Schemas (broker.schema.ts)
      → Broker (core/broker.ts)
        → Subscription Manager (core/subscription.ts)
        → Message Dispatcher (core/dispatcher.ts)
        → Dead Letter Queue (core/dlq-repository.ts)
        → Message Store (core/message.ts + MongoDB)
```

## Deployment

The service is bootstrapped via `createBootstrap()` which:

1. Starts the HTTPS server with mTLS
2. Mounts AddressManager routes (ping/health)
3. Mounts Broker routes (publish/subscribe/unsubscribe)
4. Initialises the AddressManager client in `onStart`
