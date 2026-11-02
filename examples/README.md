# Examples

This directory contains executable examples for interacting with the trading-model platform.

## Prerequisites

- Docker Compose running with core services (see [Quick Start](../docs/getting-started/quickstart.md))
- The scripts call the gateway through the `edge-proxy` on `http://localhost:8449` (`API_GATEWAY`). Services only accept SPIFFE mTLS clients (ADR-0011), so nothing is called directly
- `ADMIN_TOKEN`: one of the gateway's `AUTH_TOKENS`
- `manage-dlq.sh` also signs its requests: `DLQ_AUTH_HMAC_SECRET` (dlq-service secret), caller `admin` by default (`DLQ_ALLOWED_SERVICES`)

## Available Examples

| File                                                     | Description                                         |
| -------------------------------------------------------- | --------------------------------------------------- |
| [`list-services.sh`](./list-services.sh)                 | List the registry, or the instances of one service  |
| [`view-audit-trail.sh`](./view-audit-trail.sh)           | Query recent audit events                           |
| [`manage-dlq.sh`](./manage-dlq.sh)                       | List, replay, and delete DLQ entries (signed)       |
