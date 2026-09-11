# ADR-0008: Custom Message Broker vs Standard Alternatives

**Status:** Accepted (review for re-evaluation)
**Date:** 2026-06

## Context

The platform uses a custom HTTP-based pub/sub broker (message-manager) backed by Redis Streams with a MongoDB persistence tier and a custom WAL mechanism. Standard alternatives (Kafka, NATS, RabbitMQ) were considered but not adopted.

## Decision

**Current state:** Custom broker with Redis Streams + MongoDB + custom WAL.

### Comparison

| Criteria               | Custom (current)                 | Kafka                  | NATS          |
| ---------------------- | -------------------------------- | ---------------------- | ------------- |
| Latency                | <10ms (HTTP)                     | 2-5ms                  | <1ms          |
| Throughput ceiling     | ~1000 msg/s                      | ~1M msg/s              | ~100K msg/s   |
| Operational complexity | Low (already uses Redis+MongoDB) | High (Kraft/Zookeeper) | Medium        |
| Persistence            | Yes (MongoDB archive)            | Yes (native)           | JetStream     |
| Topic management       | Manual (Zod schema per topic)    | Automatic              | Subject-based |
| DLQ                    | Custom JSON Lines                | Built-in               | Built-in      |
| Retry logic            | Custom exponential backoff       | Custom                 | Built-in      |
| Learning curve         | Team already knows it            | Medium-high            | Low           |

### When to Migrate

Re-evaluate the custom broker when:

- Message throughput exceeds 1000 msg/s sustainably
- The team needs durable exactly-once semantics across restarts
- Kafka/NATS features (compaction, replay from offset, consumer groups) become necessary
- Operational cost of maintaining custom WAL exceeds license + ops cost of Kafka/NATS

## Consequences

### Positive (current custom approach)

- No additional infrastructure dependency
- Full control over retry, DLQ, and audit logging
- Simple HTTP-based protocol (debuggable with curl)

### Negative

- Custom code must be maintained indefinitely
- WAL implementation is custom (potential bugs)
- Throughput ceiling is lower than Kafka/NATS
- No existing ecosystem (connectors, monitoring tools)

### Mitigation

- Circuit breakers prevent cascading failures
- MongoDB persistence provides replay capability
- Metrics (queue depth, delivery rate) enable capacity planning
