# Message Delivery Service — Architecture

## Overview

The Message Delivery Service is the **internal messaging backbone** of the trading platform. It provides topic-based publish/subscribe over HTTP, enabling asynchronous, decoupled communication between microservices.

Services interact with the broker through the `@trading-model/broker-message` SDK, which handles subscription registration, message publishing, and inbound message handling via typed event emitters.

---

## Layer Architecture

```
┌────────────────────────────────────────────────────┐
│                  HTTP Transport                     │
│  POST /message  |  POST /subscription  |  DELETE   │
│              /subscription                         │
│  ┌──────────────────────────────────────────────┐  │
│  │        Controllers (http.controller.ts)       │  │
│  │  Request validation (Zod) → delegate to core │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │        Routes (http.routes.ts)                │  │
│  │  Express Router → endpoint mapping            │  │
│  └──────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│                    Validation                       │
│  ┌──────────────────────────────────────────────┐  │
│  │   Zod Schemas (broker.schema.ts)              │  │
│  │   SubscribeSchema | UnsubscribeSchema         │  │
│  │   PublishSchema | PublishMetadataSchema       │  │
│  └──────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│                     Core                            │
│  ┌──────────────────────────────────────────────┐  │
│  │   Broker (broker.ts)                          │  │
│  │   Facade: publish / subscribe / unsubscribe  │  │
│  │   Enriches messageId + emittedAt              │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │   Dispatcher (dispatcher.ts)                  │  │
│  │   In-memory topic → [Subscription] map       │  │
│  │   Deduplicates by instanceId                 │  │
│  │   Parallel dispatch via Promise.allSettled   │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │   Subscription (subscription.ts)              │  │
│  │   Per-instance delivery logic                │  │
│  │   Retry loop | TTL check | DLQ routing       │  │
│  └──────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│                   Contracts                         │
│  ┌──────────────────────────────────────────────┐  │
│  │   message.ts                                   │  │
│  │   message<T> envelope | MessageMetadata       │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

---

## Components

### Broker (`messaging/core/broker.ts`)

Public facade exposing the messaging API. Responsibilities:

- **`publish(payload, metadata)`** — Creates a `message` envelope with auto-generated `messageId` (UUID) and `emittedAt` timestamp, then delegates to the Dispatcher.
- **`subscribe({ topic, callbackPath, consumerIdentity })`** — Registers a subscription for a service instance.
- **`unsubscribe({ topic, instanceId })`** — Removes a subscription.

The Broker does **not** perform persistence, routing, or delivery logic — it is a thin orchestration layer over the Dispatcher.

### Dispatcher (`messaging/core/dispatcher.ts`)

In-memory message router. Responsibilities:

- Maintains a `Map<string, ReadonlyArray<Subscription>>` mapping topic names to subscriber subscriptions.
- **`registerSubscription()`** — Adds a subscription, skipping duplicates (same topic + instanceId).
- **`unregisterSubscription()`** — Removes a subscription by topic + instanceId.
- **`dispatch(message)`** — Looks up subscriptions by message topic, deduplicates by instanceId, and dispatches to all matching subscribers in parallel via `Promise.allSettled`. Individual failures are isolated.

### Subscription (`messaging/core/subscription.ts`)

Per-instance message delivery handler. Responsibilities:

- Resolves the target service address via the Address Manager (service discovery).
- Sends the message via HTTPS POST to the subscriber's callback endpoint.
- Implements a **retry loop** with configurable delivery semantics:

| Mode            | Behaviour                                                 |
| --------------- | --------------------------------------------------------- |
| `at-most-once`  | No retry on NACK. Single attempt, fire-and-forget.        |
| `at-least-once` | Retries indefinitely until ACK or TTL expiry.             |
| `exactly-once`  | Stops after first delivery (idempotent consumer assumed). |

- **TTL expiration**: If `emittedAt + ttl < now`, the message is routed to the Dead Letter Queue.
- **DLQ**: Placeholder implementation for routing failed or expired messages to persistent storage or an HTTP endpoint.
- Provides a `SubscribersContext` object to the consumer with `ack()`, `nack(reason)`, and `deadLetter(reason)` controls.

### Message Contracts (`messaging/core/message.ts`)

Canonical message envelope shared across producers, broker, and consumers:

```typescript
interface message<T = unknown> {
  metadata: MessageMetadata;
  payload: T;
}

interface MessageMetadata {
  messageId: string; // Auto-generated UUID
  emittedAt: Date; // Auto-generated timestamp
  schemaVersion: string; // Payload schema version
  eventType: string; // Business event name
  topic: string; // Routing channel
  publisher: IdentifyType; // { serviceName, instanceId }
  correlationId?: string; // Flow correlation
  causationId?: string; // Causality chain
  routing?: { partitionKey?; priority? };
  delivery?: { mode; ttl?; deduplicationId? };
  security?: { authContext?; signature? };
}
```

### Validation (`messaging/transport/validation/broker.schema.ts`)

Zod schemas enforce payload correctness at the HTTP boundary:

- **`SubscribeSchema`**: `{ topic, callbackPath, consumerIdentity: { serviceName, instanceId } }`
- **`UnsubscribeSchema`**: `{ topic, instanceId }`
- **`PublishSchema`**: `{ payload, metadata: PublishMetadataSchema }`
- **`PublishMetadataSchema`**: Full metadata object with all optional fields.

---

## Data Flow

### Subscribe → Publish → Deliver

```
Service A                    Broker                       Service B
   |                           |                              |
   |— POST /subscription ——→   |                              |
   |  { topic, callbackPath,   |                              |
   |    consumerIdentity }     |                              |
   |                           |— registerSubscription() ——  |
   |                           |                              |
   |                           |     (time passes)            |
   |                           |                              |
   |— POST /message ———————→   |                              |
   |  { payload, metadata }   |                              |
   |                           |— enrich (messageId, time)    |
   |                           |— dispatch()                  |
   |                           |   ├─ subscription.dispatch() |
   |                           |   │   └─ POST /callback ———→ |
   |                           |   │       { message, context}|
   |                           |   │      ← 200 / ack()       |
   |                           |   └─ (parallel for all subs) |
   |                           |                              |
   |← 204 No Content ———————— |                              |
```

### Delivery Decision Flow (per Subscription)

```
             ┌──────────┐
             │ dispatch │
             └────┬─────┘
                  │
                  ▼
         ┌────────────────┐
         │ resolveTarget  │
         │ (via discovery)│
         └───────┬────────┘
                 │
                 ▼
         ┌──────────────────┐     success     ┌──────┐
         │ POST to callback │───────────────→ │ ack()│
         └───────┬──────────┘                 └──────┘
                 │ error
                 ▼
         ┌──────────────────┐
         │ is DeadLetterErr?│──yes──→ sendToDLQ() ──→ return
         └───────┬──────────┘
                 │ no
                 ▼
         ┌──────────────────┐
         │ is TTL expired?  │──yes──→ sendToDLQ("TTL_EXPIRED") ──→ return
         └───────┬──────────┘
                 │ no
                 ▼
         ┌──────────────────────────┐
         │ is AT_MOST_ONCE + NACK? │──yes──→ return
         └───────┬──────────────────┘
                 │ no (AT_LEAST_ONCE)
                 ▼
              ┌────────┐
              │ retry  │─────────→ back to POST
              └────────┘
```

---

## Dependencies

| Dependency                       | Purpose                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `@trading-model/common`          | HttpClient, middleware (catchSync, ResponseException), types, server factories, error classes |
| `@trading-model/address-manager` | Service discovery client for resolving subscriber endpoint addresses                          |
| `express`                        | HTTP server framework                                                                         |
| `zod`                            | Runtime request body validation                                                               |
| `helmet`                         | Security headers                                                                              |
| `express-rate-limit`             | Request rate limiting                                                                         |

---

## Security Model

- All HTTP communication is over **HTTPS with mutual TLS** (mTLS).
- The service validates client certificates on every request.
- Subscriber callbacks are delivered over HTTPS using mTLS to the discovered service endpoint.
- Zod schema validation prevents malformed or malicious payloads from entering the broker.
- Rate limiting (100 requests per 15-minute window by default) protects against abuse.

---

## Known Design Decisions

| Decision                                   | Rationale                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **In-memory subscription registry**        | Simplifies deployment for the current scale; no external dependency for runtime state. Subscriptions do not survive restarts — services re-subscribe on startup via the `@trading-model/broker-message` SDK. |
| **Parallel dispatch (Promise.allSettled)** | Ensures one slow or failing subscriber does not block delivery to others.                                                                                                                                    |
| **No automatic retry backoff**             | The initial implementation retries immediately; future work should add exponential backoff and jitter.                                                                                                       |
| **DLQ is a placeholder**                   | Currently a no-op. Intended to route failed messages to persistent storage (MongoDB) or a dedicated DLQ HTTP endpoint.                                                                                       |
| **MongoDB dependency declared but unused** | The `mongodb` package is listed as a dependency for planned message persistence features (message store, DLQ persistence).                                                                                   |
