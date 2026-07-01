# ADR-0003: MongoDB for Audit, CA, and DLQ Persistence

**Status:** Accepted
**Date:** 2026-06

## Context

Three services require persistent storage:

- **audit-logger**: Immutable event stream with flexible query patterns
- **certificate-authority**: Certificate metadata, CRL entries, CA key storage
- **dlq-service**: Dead letter messages with replay metadata

## Decision

Use **MongoDB 7** as the shared persistence layer for all three services, deployed as a single replica set.

### Schema Design

Each service uses a separate database within the same MongoDB instance:

- `audit_logger` → `audit_events` collection (time-series optimized)
- `certificate-authority` → `certificates`, `crl_entries`, `ca_metadata` collections
- `dlq-service` → `dead_letter_entries` collection

## Alternatives Considered

| Alternative                  | Reason for Rejection                                         |
| ---------------------------- | ------------------------------------------------------------ |
| PostgreSQL                   | Schema rigidity; JSONB queries less ergonomic for audit logs |
| Separate MongoDB per service | Operational overhead of managing 3 DB clusters               |
| SQLite                       | Not network-accessible; no replication                       |

## Consequences

### Positive

- Schema-less design fits audit events with variable payload structures
- Rich query operators for audit log filtering (date ranges, regex on topics)
- MongoDB 7's time-series collections optimize audit event storage
- Single replica set reduces operational overhead

### Negative

- Shared MongoDB creates a single point of failure (mitigated by replica set)
- No join capabilities (not needed for these use cases)
- Higher memory footprint than SQLite

### Mitigations

- Each service uses a different database to avoid accidental cross-contamination
- Connection pooling configured per service
- Health checks verify MongoDB connectivity before accepting traffic
