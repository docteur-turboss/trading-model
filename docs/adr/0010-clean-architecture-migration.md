# ADR-0010: Clean Architecture Migration for message-manager core/

**Status:** Proposed
**Date:** 2026-06

## Context

The `services/message-manager/src/messaging/core/` directory contains 25+ imports of infrastructure dependencies (ioredis, mongodb, node:fs, config/env, config/redis). The domain layer is entirely contaminated with infrastructure concerns. A message broker's core logic (pub/sub, delivery guarantees, deduplication) should not know about Redis Streams, MongoDB drivers, or filesystem fallbacks.

## Decision

Refactor `messaging/core/` into a proper ports-and-adapters (hexagonal) architecture:

### Target Structure

```
services/message-manager/src/
├── domain/                          # Pure domain — zero infrastructure deps
│   ├── message.ts                   # Message, DeliveryMode, Topic types
│   ├── subscription.ts              # Subscription management
│   ├── dispatcher-domain.ts          # Dispatch decision (retry, DLQ routing)
│   ├── deduplication.ts             # Deduplication logic (pure)
│   └── delivery-guarantees.ts       # At-most-once, at-least-once, exactly-once
│
├── application/                     # Orchestration — ports + DTOs
│   ├── ports/
│   │   ├── message-store-port.ts     # Interface: store(), read(), ack()
│   │   ├── subscription-store-port.ts # Interface: save(), load(), delete()
│   │   └── dlq-port.ts              # Interface: routeToDlq()
│   ├── services/
│   │   ├── publish-service.ts        # Orchestrates publish → store + dispatch
│   │   ├── dispatch-service.ts       # Orchestrates dispatch → delivery + retry + DLQ
│   │   └── recovery-service.ts       # WAL recovery at startup
│   └── dtos/
│       └── message-dto.ts            # Message DTO (transport format)
│
├── infrastructure/                  # Adapters implementing ports
│   ├── redis/
│   │   ├── redis-stream-store.ts     # implements MessageStorePort (Redis Streams)
│   │   ├── redis-wal-flusher.ts      # WAL flush to Redis Streams
│   │   ├── redis-subscription-store.ts # implements SubscriptionStorePort
│   │   └── redis-dedup.ts            # Redis-based deduplication
│   ├── mongodb/
│   │   ├── mongo-archive-store.ts    # MongoDB message archive
│   │   └── mongo-subscription-store.ts
│   ├── http/
│   │   ├── http-message-delivery.ts  # implements DeliveryPort
│   │   └── http-routes.ts            # Express route definitions
│   └── fallback/
│       └── file-fallback-store.ts    # Filesystem fallback for WAL
│
└── config/                          # Composition root (wire everything)
    ├── container.ts                  # DI container: wire ports → adapters
    └── env.ts                        # Environment config
```

### Migration Phases

| Phase                  | Effort | Description                                                                              |
| ---------------------- | ------ | ---------------------------------------------------------------------------------------- |
| **1** — Extract ports  | 3d     | Create `application/ports/` interfaces. Existing classes implement them via `implements` |
| **2** — Move infra     | 5d     | Move Redis/MongoDB/file code to `infrastructure/` adapters. Update imports               |
| **3** — Split domain   | 3d     | Extract pure domain logic into `domain/` files                                           |
| **4** — Wire container | 2d     | Create DI container in `config/container.ts`. Wire ports → adapters                      |

## Alternatives Considered

| Alternative            | Reason for Rejection                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| Keep current structure | Tech debt accumulates. Every config change requires touching "domain" code |
| Full rewrite           | Too risky. Incremental migration preserves existing test coverage          |

## Current State (Post-Extraction)

- `persistence-queue.ts` — extracted from dispatcher.ts (retry queue, self-contained)
- `memory-wal-flusher.ts` — created for future integration (WAL buffer flush)
- `dispatcher.ts` — uses `CircuitBreaker` from `@trading-model/common/reliability`

## Dependencies on This Migration

The 3 SPOFs identified in the architecture audit (message-manager, certificate-authority, discovery-server) would benefit from hexagonal refactoring to support:

- Multiple storage backends (Redis, Kafka, NATS — pluggable via ports)
- Graceful degradation (no-database mode via fallback adapters)
- Testability (domain logic testable without Redis/MongoDB)
