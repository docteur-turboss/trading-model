# DLQ Service

**Package:** `dlq-service` (v2.0.0)
**Path:** `services/dlq-service/`

## Role

Stores and manages dead letter entries — messages that could not be delivered after exhausting retry attempts. Provides replay capability to re-inject entries into the message bus.

## Dependencies

| Dependency | Type |
|-----------|------|
| `@trading-model/common` | runtime |
| `@trading-model/address-manager` | runtime |
| `@trading-model/certificate-client` | runtime |
| MongoDB | persistence |
| Redis | rate limiting |

## Endpoints

All endpoints are mTLS-secured and served on **container port 3000**:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/dlq` | Store a new dead letter entry |
| `GET` | `/dlq` | List dead letter entries (paginated) |
| `GET` | `/dlq/:id` | Get a single dead letter entry |
| `POST` | `/dlq/:id/replay` | Replay a single dead letter entry |
| `POST` | `/dlq/replay` | Replay multiple entries by filter |
| `DELETE` | `/dlq/:id` | Delete a dead letter entry |
| `GET` | `/health` | Health check |

See source code at `services/dlq-service/src/dlq/` for detailed request/response schemas.

## Examples

```bash
# List dead letter entries
curl -sk --cert /certs/client.crt --key /certs/client-key.pem \
  https://localhost:8452/dlq

# Get a single entry
curl -sk --cert /certs/client.crt --key /certs/client-key.pem \
  https://localhost:8452/dlq/entry-uuid-123

# Replay a single entry (re-inject to message bus)
curl -sk --cert /certs/client.crt --key /certs/client-key.pem \
  https://localhost:8452/dlq/entry-uuid-123/replay -X POST

# Replay all entries matching a filter
curl -sk --cert /certs/client.crt --key /certs/client-key.pem \
  https://localhost:8452/dlq/replay -X POST \
  -H 'Content-Type: application/json' \
  -d '{"topic":"market.trade.recent.fetch"}'

# Delete a single entry
curl -sk --cert /certs/client.crt --key /certs/client-key.pem \
  https://localhost:8452/dlq/entry-uuid-123 -X DELETE

# Health check
curl -sk --cert /certs/client.crt --key /certs/client-key.pem \
  https://localhost:8452/health

# Purge all DLQ entries (via API gateway with admin token)
curl -sk https://localhost:8448/v1/messages/dlq -X DELETE \
  -H 'x-api-key: <admin-token>'
```

## Environment Variables

See [Environment Variables](../../deployment/ENV.md#dlq-service).

## Limitations

- Maximum stored entries is configurable via `MAX_ENTRIES` (default: 100,000)
- Replay delivers back to message-manager with original payload headers intact
