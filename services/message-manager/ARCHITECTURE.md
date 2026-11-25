# Message Delivery Service — Architecture

Routes, delivery modes, retry, journal, DLQ and security: [docs/services/message-manager.md](../../docs/services/message-manager.md). This file holds the layering and the per-subscription delivery decision.

## Layer Architecture

```
┌────────────────────────────────────────────────────┐
│                  HTTP Transport                     │
│  Routes (http.routes.ts) → Controllers              │
│  (http.controller.ts): Zod validation, delegate     │
├────────────────────────────────────────────────────┤
│                    Validation                       │
│  broker.schema.ts: Subscribe | Unsubscribe |        │
│  Publish | PublishMetadata schemas                  │
├────────────────────────────────────────────────────┤
│                     Core                            │
│  Dispatcher (dispatcher.ts)                         │
│    publish / subscribe / unsubscribe                │
│    enriches messageId + emittedAt                   │
│    topic → subscriptions from the shared store      │
│    one subscription per instanceId                  │
│    publishes into the journal                       │
│  Subscription (subscription.ts)                     │
│    per-instance delivery: retry, TTL, DLQ routing   │
│    policy decided by classifyDeliveryError          │
│    (packages/broker-message, bus/)                  │
├────────────────────────────────────────────────────┤
│                   Contracts                         │
│  @trading-model/contracts message envelope          │
└────────────────────────────────────────────────────┘
```

## Delivery Decision Flow (per journal entry)

The delivery worker (`delivery-worker.ts`) reads entries from the journal and calls `Subscription` for one attempt. Retry state (attempts, last attempt) lives in the journal pending list shared by the replicas, not in the process.

```
 resolveTarget → POST callback ──success──→ delivered (ack)
                       │ error
                       ▼
        classifyDeliveryError (packages/broker-message/src/bus/delivery-error-classifier.ts)
                       │
     ┌─────────────────┼──────────────────────┐
     ▼                 ▼                      ▼
 DLQ action         SWALLOW                 retry
 markDeadLetter     settled (dropped,       left pending, next attempt
 (rejected 400/413/ acked)                  due after backoff
 415/422 first,
 then TTL, delivery
 mode, max attempts)
```
