# audit-logger — Audit Logger

Immutable traceability service for all decisions, transactions, and errors. Subscribes to all event bus topics, persists events to MongoDB, and provides queryable audit trails.

## General Information

| Property         | Value                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Service name     | `audit-logger-service`                                                                              |
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

**`GET /health`**

Full health status including queue and worker metrics.

**Response:** `200 OK`

```json
{
  "status": "ok",
  "queueDepth": 42,
  "canAccept": true,
  "workerCount": 3,
  "averageLoad": 0.45,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Audit Events

**`GET /events`**

List and filter audit events.

**Query Parameters:**

| Parameter       | Type     | Description                  |
| --------------- | -------- | ---------------------------- |
| `topic`         | string   | Filter by event topic        |
| `publisher`     | string   | Filter by publisher service  |
| `correlationId` | string   | Filter by correlation ID     |
| `startDate`     | ISO date | Start of date range          |
| `endDate`       | ISO date | End of date range            |
| `page`          | number   | Page number (default: 1)     |
| `limit`         | number   | Results per page (max: 1000) |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "messageId": "msg-uuid-123",
      "topic": "market.trade.recent.fetch",
      "eventType": "market.trade.recent.fetch",
      "publisher": "financial-scraper-service",
      "correlationId": "corr-uuid-456",
      "payload": { "symbol": "BTCUSDT", "price": 50000.0 },
      "recordedAt": "2025-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1234,
    "totalPages": 25
  }
}
```

**`GET /events/stats`**

Aggregate audit statistics.

**Response:** `200 OK`

```json
{
  "totalEvents": 50000,
  "eventsByTopic": {
    "market.trade.recent.fetch": 15000,
    "market.candlestick.series.fetch": 12000
  },
  "eventsByPublisher": {
    "financial-scraper-service": 30000
  },
  "dateRange": {
    "earliest": "2025-01-01T00:00:00Z",
    "latest": "2025-01-15T10:30:00Z"
  }
}
```

**`GET /events/:messageId`**

Get a single audit event by its message ID.

**Response:** `200 OK` (full `AuditEventDocument`) or `404`

### Message Ingestion

**`POST /message`**

Receive an event bus message for audit logging (called internally by the message-manager).

**Response:** `200 OK`

```json
{
  "status": "recorded"
}
```

## WebSocket Protocol

The service exposes a WebSocket upgrade path on the same HTTPS server for worker communication.
The protocol is shared with `job-scheduler` — see [Worker WebSocket Protocol](../worker-protocol.md) for full specification.

| Message Type    | Direction       | Description                         |
| --------------- | --------------- | ----------------------------------- |
| `register`      | Worker → Server | Register as a worker                |
| `heartbeat`     | Worker → Server | Worker heartbeat                    |
| `disconnect`    | Worker → Server | Worker disconnecting                |
| `job.assigned`  | Server → Worker | Assign a job to a worker            |
| `heartbeat.ack` | Server → Worker | Heartbeat acknowledgment            |
| `drain`         | Server → Worker | Signal worker to drain pending jobs |

## Architecture

```
Event Bus (Message Manager) ──POST /message──→ Audit Logger ──→ MongoDB (audit_events)
                                                        │
                                                   Job Scheduler
                                                        │
                                                   Internal Queue (priority 1-5)
                                                        │
                                              Worker Protocol (WebSocket Server)
                                                        │
                                              External Workers
```

- **Event Ingestion:** Subscribes to all broker topics. Incoming messages are persisted as `AuditEventDocument` in MongoDB.
- **Job Processing:** Priority-queued jobs (1-5) distributed to workers via WebSocket with ACK/fail/complete lifecycle.
- **Recovery:** `OrphanDetector` and `ReAllocator` (shared from `@trading-model/common/recovery/`) scan for stale workers and re-queue orphaned jobs. On startup, recovers non-terminal jobs from MongoDB.
- **Back-pressure:** Configurable `MAX_QUEUE_DEPTH` and `MAX_WORKER_LOAD_RATIO` — returns 429 when at capacity.

## Environment Variables

| Variable                    | Default                                  | Description                   |
| --------------------------- | ---------------------------------------- | ----------------------------- |
| `PORT`                      | `3000`                                   | Service listen port           |
| `MONGODB_URI`               | `mongodb://localhost:27017/audit-logger` | MongoDB connection            |
| `SERVICE_NAME`              | `audit-logger-service`                   | Discovery service name        |
| `ADDRESS_MANAGER_URL`       | `https://localhost:8443`                 | Discovery server URL          |
| `MAX_QUEUE_DEPTH`           | `10000`                                  | Max internal queue depth      |
| `MAX_WORKER_LOAD_RATIO`     | `0.85`                                   | Back-pressure threshold       |
| `ACK_TIMEOUT_MS`            | `30000`                                  | Worker ACK deadline (ms)      |
| `MAX_RETRIES_PER_JOB`       | `3`                                      | Max job retry count           |
| `ORPHAN_SCAN_INTERVAL_MS`   | `10000`                                  | Orphan job scan interval      |
| `WORKER_HEARTBEAT_TTL_MS`   | `30000`                                  | Worker heartbeat TTL (ms)     |
| `AUDIT_RETENTION_DAYS`      | `90`                                     | Audit event retention in days |
| `GAP_DETECTION_INTERVAL_MS` | `60000`                                  | Gap detection interval (ms)   |
