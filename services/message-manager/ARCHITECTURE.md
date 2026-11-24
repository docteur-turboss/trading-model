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
│    parallel dispatch via Promise.allSettled         │
│  Subscription (subscription.ts)                     │
│    per-instance delivery: retry, TTL, DLQ routing   │
│    policy decided by DeliveryErrorClassifier        │
│    (domain/delivery-error-classifier.ts)            │
├────────────────────────────────────────────────────┤
│                   Contracts                         │
│  @trading-model/contracts message envelope          │
└────────────────────────────────────────────────────┘
```

## Delivery Decision Flow (per Subscription)

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
