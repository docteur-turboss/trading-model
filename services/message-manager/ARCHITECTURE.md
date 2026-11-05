# Message Delivery Service — Architecture

## Overview

The Message Delivery Service is the **internal messaging backbone** of the trading platform. It provides topic-based publish/subscribe over HTTP, enabling asynchronous, decoupled communication between microservices.

Services interact with the broker through the `@trading-model/broker-message` SDK, which handles subscription registration, message publishing, and inbound message handling via typed event emitters.

---

## Layer Architecture

```
┌────────────────────────────────────────────────────┐
│                  HTTP Transport                     │
│  POST /message  |  POST /subscribe  |  DELETE   │
│              /subscribe                         │
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
│  │   Dispatcher (dispatcher.ts)                  │  │
│  │   publish / subscribe / unsubscribe          │  │
│  │   Enriches messageId + emittedAt              │  │
│  │   Topic → subscriptions, read from the       │  │
│  │   shared store (Redis, 60s lease)            │  │
│  │   Counts messages with no subscriber         │  │
│  │   One subscription per instanceId            │  │
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

### Dispatcher (`application/services/dispatcher.ts`)

Central message router exposing the messaging API. Responsibilities:

- **`publish(payload, metadata)`** — Creates a `message` envelope with auto-generated `messageId` (UUID) and `emittedAt` timestamp, then dispatches to subscribers.
- **`subscribe({ topic, callbackPath, consumerIdentity })`** — Registers a subscription for a service instance.
- **`unsubscribe({ topic, instanceId })`** — Removes a subscription.
- Maintains a `Map<string, ReadonlyArray<Subscription>>` mapping topic names to subscriber subscriptions.
- Deduplicates subscriptions by `instanceId` (same topic + instanceId).
- **`dispatch(message)`** — Looks up subscriptions by message topic, deduplicates by instanceId, and dispatches to all matching subscribers in parallel via `Promise.allSettled`. Individual failures are isolated.

### Subscription (`application/services/subscription.ts`)

Per-instance message delivery handler. Responsibilities:

- Resolves the target service address via the Address Manager (service discovery).
- Sends the message via HTTPS POST to the subscriber's callback endpoint.
- Implements a **retry loop** with configurable delivery semantics:

| Mode            | Behaviour                                                 |
| --------------- | --------------------------------------------------------- |
| `at-most-once`  | Single attempt; a failure is dropped (fire-and-forget).   |
| `at-least-once` | Up to 10 attempts (backoff 1s → 20s cap), then dead letter. |
| `exactly-once`  | Single attempt, no broker retry; a failure is dead-lettered (`SINGLE_ATTEMPT_FAILED`). No duplicate downstream depends on subscriber idempotency ([ADR-0019](../../docs/adr/0019-message-broker-as-built.md)). |

- **TTL expiration**: If `emittedAt + ttl < now`, the message is routed to the Dead Letter Queue.
- **DLQ**: dead letters go to dlq-service (signed `POST /dlq`); while it cannot take them they wait in `DLQ_LOCAL_FALLBACK_PATH` and are forwarded every minute and at shutdown (ADR-0019).
- The whole policy (DLQ, drop or retry) is decided in the domain by `DeliveryErrorClassifier` (`domain/delivery-error-classifier.ts`); the application layer only carries it out. A subscriber answer saying the message itself is wrong (400 — payload refused by its topic schema —, 413, 415, 422) is dead-lettered at once (`REJECTED_BY_SUBSCRIBER`) instead of after 10 attempts; auth, routing, throttling and server errors keep the retries.

### Message Contracts (`@trading-model/contracts/message-types`)

Canonical message envelope shared across producers, broker, and consumers:

```typescript
interface Message<T = unknown> {
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

### Validation (`adapters/inbound/validation/broker.schema.ts`)

Zod schemas enforce payload correctness at the HTTP boundary:

- **`SubscribeSchema`**: `{ topic, callbackPath, consumerIdentity: { serviceName, instanceId } }`
- **`UnsubscribeSchema`**: `{ topic, instanceId }`
- **`PublishSchema`**: `{ payload, metadata: PublishMetadataSchema }`
- **`PublishMetadataSchema`**: Full metadata object with all optional fields.

---

## Data Flow

### Subscribe → Publish → Deliver

```
Service A                    Dispatcher                    Service B
   |                           |                              |
   |— POST /subscribe ——→   |                              |
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
         │ 400/413/415/422? │──yes──→ sendToDLQ("REJECTED_BY_SUBSCRIBER") ──→ return
         └───────┬──────────┘
                 │ no
                 ▼
         ┌──────────────────┐
         │ is TTL expired?  │──yes──→ sendToDLQ("TTL_EXPIRED") ──→ return
         └───────┬──────────┘
                 │ no
                 ▼
         ┌──────────────────┐
         │ AT_MOST_ONCE?    │──yes──→ drop ──→ return
         └───────┬──────────┘
                 │ no
                 ▼
         ┌──────────────────┐
         │ EXACTLY_ONCE?    │──yes──→ sendToDLQ("SINGLE_ATTEMPT_FAILED") ──→ return
         └───────┬──────────┘
                 │ no (AT_LEAST_ONCE)
                 ▼
         ┌──────────────────┐
         │ 10 attempts done?│──yes──→ sendToDLQ("MAX_RETRIES_EXCEEDED") ──→ return
         └───────┬──────────┘
                 │ no
                 ▼
          ┌──────────────┐
          │ backoff+retry│─────────→ back to POST
          └──────────────┘
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
- Zod schema validation prevents malformed or malicious payloads from entering the dispatcher.
- Rate limiting (100 requests per 15-minute window by default) protects against abuse.

---

## Known Design Decisions

| Decision                                   | Rationale                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Shared subscription registry (Redis)**   | Every replica reads the same subscriptions (`RedisSubscriptionStore`, one hash per topic): a subscription made on one replica routes the messages published on any other, and survives a restart. Subscribers renew theirs every 15s (`@trading-model/broker-message`); a subscription not renewed for 60s expires. Without Redis, `InMemorySubscriptionStore` (single replica only). A message whose topic has no subscriber is dropped and counted (`mm_messages_unrouted_total`, alert `MessagesUnrouted`). |
| **Parallel dispatch (Promise.allSettled)** | Ensures one slow or failing subscriber does not block delivery to others.                                                                                                                                    |
| **Bounded retry backoff**                  | Exponential backoff (1s base, 20s cap, ±20% jitter), 10 attempts of at most 10s: the worst case (~4.3 min) fits in `PUBLISH_TIMEOUT_MS` (5 min), checked by `backoff-calculator.spec.ts`. |
| **Dead letters in dlq-service**            | `ForwardingDeadLetterStore` sends them to dlq-service and keeps a local JSONL file only while it is unreachable; no database in message-manager itself.                                                    |
