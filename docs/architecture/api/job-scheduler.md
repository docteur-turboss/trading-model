# job-scheduler — Job Scheduler

Centralised distributed job orchestrator with priority queues, ACK-based delivery protocol, worker registry, back-pressure control, and automatic failure recovery.

## General Information

| Property         | Value                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Service name     | `job-scheduler-service`                                                                             |
| Port (host)      | `8451`                                                                                              |
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

Full health with queue and worker metrics.

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

### Job Operations

**`POST /jobs`**

Submit a new job to the scheduler.

**Request Body:**

```json
{
  "type": "data-processing",
  "payload": { "symbol": "BTCUSDT", "interval": "1h" },
  "priority": 3,
  "maxRetries": 3
}
```

**Response:** `201 Created`

```json
{
  "jobId": "job-uuid-123",
  "status": "queued"
}
```

**Response:** `429 Too Many Requests` (back-pressure active)

```json
{
  "error": "BACK_PRESSURE",
  "retryAfter": 5
}
```

**`GET /jobs/:id`**

Get job details by ID.

**Response:** `200 OK`

```json
{
  "jobId": "job-uuid-123",
  "type": "data-processing",
  "status": "assigned",
  "priority": 3,
  "assignedWorker": "worker-uuid-456",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

**`POST /jobs/:id/cancel`**

Cancel a pending, queued, or assigned job.

**Response:** `200 OK`

```json
{
  "status": "cancelled"
}
```

**Response:** `409 Conflict` (running or completed job)

```json
{
  "error": "CONFLICT",
  "message": "Cannot cancel a running or completed job"
}
```

### ACK Operations (Worker Reporting)

**`POST /jobs/:id/ack`**

Acknowledge job receipt (marks job as running).

**Response:** `200 OK`

```json
{
  "status": "acknowledged"
}
```

**`POST /jobs/:id/complete`**

Report job completion.

**Request Body:**

```json
{
  "result": { "processed": 100 }
}
```

**Response:** `200 OK`

```json
{
  "status": "completed"
}
```

**`POST /jobs/:id/fail`**

Report job failure.

**Request Body:**

```json
{
  "error": "Rate limit exceeded"
}
```

**Response:** `200 OK`

```json
{
  "status": "failed"
}
```

### Worker Management

**`POST /workers/register`**

Register a new worker.

**Request Body:**

```json
{
  "workerId": "worker-uuid-456",
  "address": "192.168.1.50",
  "port": 9000,
  "capabilities": ["data-processing", "ml-training"],
  "maxConcurrency": 5
}
```

**Response:** `201 Created`

```json
{
  "status": "registered",
  "workerId": "worker-uuid-456"
}
```

**`POST /workers/heartbeat`**

Worker heartbeat to maintain liveness.

**Request Body:**

```json
{
  "workerId": "worker-uuid-456",
  "currentLoad": 2
}
```

**Response:** `200 OK`

```json
{
  "status": "ok"
}
```

**`GET /workers`**

List all active workers.

**Response:** `200 OK`

```json
{
  "count": 3,
  "workers": [
    {
      "workerId": "worker-uuid-456",
      "address": "192.168.1.50",
      "port": 9000,
      "load": 2,
      "maxConcurrency": 5,
      "lastHeartbeat": "2025-01-15T10:30:00Z"
    }
  ]
}
```

## WebSocket Protocol

The service exposes a WebSocket upgrade path on the same HTTPS server for worker communication.
The protocol is shared with `audit-logger` — see [Worker WebSocket Protocol](../worker-protocol.md) for full specification.

| Message Type    | Direction       | Description                         |
| --------------- | --------------- | ----------------------------------- |
| `register`      | Worker → Server | Register as a worker                |
| `heartbeat`     | Worker → Server | Worker heartbeat                    |
| `disconnect`    | Worker → Server | Worker disconnecting                |
| `job.assigned`  | Server → Worker | Assign a job to a worker            |
| `heartbeat.ack` | Server → Worker | Heartbeat acknowledgment            |
| `drain`         | Server → Worker | Signal worker to drain pending jobs |

## Job Lifecycle

```
pending → queued → assigned → running → completed
                                    → failed (retry → queued or final)
                                    → cancelled
              assigned → orphaned → queued (on ACK timeout)
```

- **Priority Queues:** 5 levels (1 = highest, 5 = lowest). Jobs dequeued from lowest-numbered non-empty queue first.
- **Worker Assignment:** `WorkerRegistry.findBestWorker()` selects the worker with lowest load that matches required capabilities.
- **ACK Timeout:** 30s timer after job dispatch. If no `POST /jobs/:id/ack` received, job is marked `orphaned` and re-queued.
- **Back-pressure:** Returns 429 if queue depth exceeds `MAX_QUEUE_DEPTH` or all workers exceed `MAX_WORKER_LOAD_RATIO`.

## Architecture

```
Client Apps ──POST /jobs──→ Job Scheduler
Workers ──── WebSocket ──→ Job Scheduler (WorkerProtocol/WSS)
                               │
                           JobScheduler
                               │
                    ┌──────────┼──────────┐
                    │          │          │
              InternalQueue  WorkerRegistry  JobRepository
              (priority 1-5) (heartbeat,    (MongoDB)
                              registration)
                    │
               OrphanDetector ──→ ReAllocator      ← @trading-model/common/recovery/
               (periodic scan)    (re-queue stale jobs)

Startup Recovery: loads all non-terminal jobs from MongoDB
```

- **OrphanDetector / ReAllocator:** Shared from `@trading-model/common/recovery/`. `OrphanDetector` periodically scans for workers with stale heartbeats, marks their jobs as orphaned, and triggers re-allocation via `ReAllocator`.
- **Startup Recovery:** On boot, scans MongoDB for non-terminal jobs (pending/queued/assigned/running/orphaned) and re-queues them.

## Environment Variables

| Variable                  | Default                                   | Description               |
| ------------------------- | ----------------------------------------- | ------------------------- |
| `PORT`                    | `3000`                                    | Service listen port       |
| `MONGODB_URI`             | `mongodb://localhost:27017/job-scheduler` | MongoDB connection        |
| `SERVICE_NAME`            | `job-scheduler-service`                   | Discovery service name    |
| `ADDRESS_MANAGER_URL`     | `https://discovery-server:3000`           | Discovery server URL      |
| `MAX_QUEUE_DEPTH`         | `10000`                                   | Max internal queue depth  |
| `MAX_WORKER_LOAD_RATIO`   | `0.85`                                    | Back-pressure threshold   |
| `ACK_TIMEOUT_MS`          | `30000`                                   | Worker ACK deadline (ms)  |
| `MAX_RETRIES_PER_JOB`     | `3`                                       | Max job retry count       |
| `ORPHAN_SCAN_INTERVAL_MS` | `10000`                                   | Orphan job scan interval  |
| `WORKER_HEARTBEAT_TTL_MS` | `30000`                                   | Worker heartbeat TTL (ms) |
