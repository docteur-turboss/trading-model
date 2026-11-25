# audit-logger — Audit Logger

Immutable traceability service for all decisions, transactions, and errors. Subscribes to the audit, training and dlq topics, persists events to MongoDB, and provides queryable audit trails.

## General Information

| Property         | Value                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Service name     | `audit-logger`                                                                              |
| Port (host)      | `8450`                                                                                              |
| Port (container) | `3000`                                                                                              |
| Dependencies     | `@trading-model/common`, `@trading-model/address-manager`, `@trading-model/broker-message`, MongoDB |

## REST Endpoints

### Health

**`GET /ping`**

Lightweight health check.

**Response:** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**`GET /health/ready`**

Readiness (MongoDB ping).

### Audit Events

**`GET /v1/events`**

List and filter audit events, newest first. Parameters and responses are declared in `src/adapters/inbound/http/api-routes.ts` (`AUDIT_API`, ADR-0021) and published in the [OpenAPI](openapi/api-gateway.yaml). Invalid input answers 400 `{ "error": "Validation failed", "details": [...] }`.

**Query Parameters:**

| Parameter       | Type                  | Description                                     |
| --------------- | --------------------- | ----------------------------------------------- |
| `topic`         | string                | Filter by event topic (empty: no filter)        |
| `publisher`     | string                | Filter by publisher service                     |
| `correlationId` | string                | Filter by correlation ID                        |
| `startDate`     | ISO date or date-time | `receivedAt` at or after                        |
| `endDate`       | ISO date or date-time | `receivedAt` at or before                       |
| `page`          | integer ≥ 1           | Page number (default: 1)                        |
| `limit`         | integer ≥ 1           | Results per page (default: 100, capped at 1000) |

**Response:** `200 OK`

```json
{
  "docs": [
    {
      "_id": "6720f0aa0000000000000001",
      "receivedAt": "2025-01-15T10:30:00.000Z",
      "ttl": "2026-01-15T10:30:00.000Z",
      "dataHash": "9f2c…",
      "previousHash": "41ab…",
      "chainSequence": 1234,
      "metadata": {
        "topic": "training.model.published",
        "eventType": "training.model.published",
        "publisher": "trader-service",
        "instanceId": "trader-service-1",
        "messageId": "msg-uuid-123",
        "correlationId": "corr-uuid-456"
      },
      "payload": { "modelId": "model-123" }
    }
  ],
  "total": 1234,
  "page": 1,
  "limit": 100
}
```

**`GET /v1/events/stats`**

Aggregate audit statistics.

**Response:** `200 OK`

```json
{
  "totalEvents": 50000,
  "eventsByTopic": {
    "training.model.published": 15000,
    "dlq.entry.added": 12000
  },
  "eventsByPublisher": {
    "trader-service": 30000
  },
  "dateRange": {
    "earliest": "2025-01-01T00:00:00Z",
    "latest": "2025-01-15T10:30:00Z"
  }
}
```

**`GET /v1/events/:messageId`**

Get a single audit event by its message ID.

**Response:** `200 OK` (the event, same shape as in `docs`) or `404` `{ "error": "Event not found" }`

### Message Ingestion

No HTTP route: the service consumes the bus in process (`BrokerMessage.intents`, ADR-0073) and records each message.

Every event is appended to a hash chain (`chainSequence`, `previousHash`, `dataHash`; `chainSequence` and `metadata.messageId` are unique indexes). Messages arrive concurrently, so an instance writes its inserts one at a time. If another replica takes the same sequence first, the insert retries on the new tail (up to 5 attempts). A redelivered message (same `messageId`) is recorded once (`audit_events_stored_total{status="duplicate"}`).

audit-logger consumes the audit, training and dlq topics from startup (not market data: MySQL keeps it, ADR-0027), as consumer group `audit-logger` of the journal.

## Architecture

```
Event Bus (Message Manager) ──POST /message──→ Audit Logger ──→ MongoDB (audit_events)
                                                        │
                                          chain verification + S3 anchors (ADR-0027)
```

- **Event Ingestion:** Subscribes to all broker topics. Incoming messages are persisted as `AuditEventDocument` in MongoDB.
- **No job scheduler:** the job queue and WebSocket worker protocol it used to carry had no producer and no worker; they were removed by [ADR-0029](../adr/0029-orphan-subsystems-retired-and-reachability-gate.md).

## Environment Variables

| Variable                    | Default                                  | Description                   |
| --------------------------- | ---------------------------------------- | ----------------------------- |
| `PORT`                      | `3000`                                   | Service listen port           |
| `MONGODB_URI`               | `mongodb://localhost:27017/audit-logger` | MongoDB connection            |
| `SERVICE_NAME`              | `audit-logger`                   | Discovery service name        |
| `ADDRESS_MANAGER_URL`       | `https://localhost:8443`                 | Discovery server URL          |
| `AUDIT_RETENTION_DAYS`      | `1827`                                   | Audit event retention in days (5 years) |
