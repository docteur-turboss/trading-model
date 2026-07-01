# DLQ Service

> Dead Letter Queue — stores and manages messages that could not be delivered after exhausting retry attempts.

## Role

Provides durable storage for undeliverable messages with replay capability, automatic retry, and periodic pruning. Integrates with the message-manager to receive undeliverable messages and re-inject them on demand.

## Quick Start

```bash
npm run -w dlq-service dev
```

Requires MongoDB 7+ and Redis 7+.

## Configuration

| Variable                 | Default                     | Description                  |
| ------------------------ | --------------------------- | ---------------------------- |
| `PORT`                   | `3000`                      | HTTPS listen port            |
| `MONGO_URI`              | `mongodb://localhost:27017` | MongoDB connection           |
| `MONGO_DB`               | `dlq-service`               | MongoDB database name        |
| `REDIS_URL`              | `redis://localhost:6379`    | Redis connection             |
| `MAX_ENTRIES`            | `100000`                    | Max stored DLQ entries       |
| `DLQ_AUTO_RETRY_ENABLED` | `false`                     | Enable automatic retry       |
| `PRUNE_INTERVAL_MS`      | `86400000`                  | Prune check interval (24h)   |
| `ENTRY_TTL_MS`           | `2592000000`                | Entry TTL before prune (30d) |
| `ADDRESS_MANAGER_URL`    | `https://localhost:8443`    | Discovery server URL         |

## API

See [API doc](../../docs/architecture/api/dlq-service.md) for full endpoint reference.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Testing

```bash
npm test
npm run test:coverage
```

Coverage target: 80%.
