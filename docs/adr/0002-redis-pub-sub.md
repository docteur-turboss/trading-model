# ADR-0002: Redis Streams for Inter-Service Messaging

**Status:** Accepted
**Date:** 2026-06

## Context

Microservices need a reliable, low-latency messaging backbone for asynchronous communication. Key requirements:

- Topic-based publish/subscribe
- At-least-once delivery with retries
- Message persistence for audit
- Dead letter queue for undeliverable messages

## Decision

Implement a custom HTTP-based pub/sub broker (message-manager) that uses **Redis Streams** as the backing message store, with MongoDB for long-term message persistence.

### Architecture

```
Publisher → HTTP POST /message → message-manager → Redis Stream → Subscriber HTTP callback
                                                      ↓
                                                   MongoDB (persistence)
```

- **Redis Streams** provide ordered, persistent message queues with consumer groups
- **MongoDB** stores messages for audit and replay beyond Redis's bounded memory
- **HTTP callbacks** avoid the complexity of maintaining persistent connections
- **Three delivery modes**: at-most-once, at-least-once, exactly-once (idempotent)

## Alternatives Considered

| Alternative             | Reason for Rejection                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| RabbitMQ                | Additional infrastructure; HTTP overhead for AMQP bridging                 |
| Apache Kafka            | Overkill for <1000 msg/s; requires Zookeeper/Kraft; operational complexity |
| NATS                    | No persistence guarantees; no DLQ concept                                  |
| Redis Pub/Sub (classic) | No persistence; messages lost on disconnect                                |

## Consequences

### Positive

- Redis is already required for discovery-server caching
- Streams provide consumer groups, message acknowledgment, and TTL
- HTTP transport is simple and debuggable (no custom protocol)
- MongoDB persistence enables audit and replay

### Negative

- HTTP callbacks mean subscribers must be HTTP servers
- No native back-pressure (implemented at application level with circuit breakers)
- Redis memory bound — old messages must be pruned or moved to MongoDB

### Mitigations

- Circuit breaker pattern: after 5 consecutive delivery failures, new messages route directly to DLQ
- Exponential backoff (1s base, 60s cap, ±20% jitter) for retries
- DLQ stores messages as JSON Lines with failure metadata
