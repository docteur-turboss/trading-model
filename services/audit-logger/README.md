# Audit Logger

> Immutable traceability service for all decisions, transactions, and errors.

## Role

Subscribes to all message bus topics, persists events to MongoDB, and provides queryable audit trails with pagination, filtering, and aggregate statistics.

## Quick Start

```bash
npm run -w audit-logger dev
```

Requires MongoDB 7+ running at `MONGODB_URI`.

## Configuration

| Variable               | Default                                  | Description                   |
| ---------------------- | ---------------------------------------- | ----------------------------- |
| `PORT`                 | `3000`                                   | HTTPS listen port             |
| `MONGODB_URI`          | `mongodb://localhost:27017/audit-logger` | MongoDB connection            |
| `SERVICE_NAME`         | `audit-logger`                          | Discovery service name        |
| `ADDRESS_MANAGER_URL`  | `https://localhost:8443`                 | Discovery server URL          |
| `MAX_QUEUE_DEPTH`      | `10000`                                  | Max internal queue depth      |
| `AUDIT_RETENTION_DAYS` | `90`                                     | Audit event retention in days |

## API

See [API doc](../../docs/services/audit-logger.md) for full endpoint reference.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Testing

```bash
npm test
npm run test:coverage
```

Coverage target: 100%.
