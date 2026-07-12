# Examples

This directory contains executable examples for interacting with the trading-model platform.

## Prerequisites

- Docker Compose running with core services (see [Quick Start](../docs/getting-started/quickstart.md))
- TLS certificates generated (`bash scripts/generate-certs.sh`)
- Admin token configured (set in `.env` as `AUTH_TOKENS`)

## Available Examples

| File                                                     | Description                                         |
| -------------------------------------------------------- | --------------------------------------------------- |
| [`publish-message.sh`](./publish-message.sh)             | Publish a market data event to the message bus      |
| [`register-service.sh`](./register-service.sh)           | Register a mock service with the discovery server   |
| [`view-audit-trail.sh`](./view-audit-trail.sh)           | Query recent audit events                           |
| [`manage-dlq.sh`](./manage-dlq.sh)                       | List, retry, and purge DLQ messages                 |
| [`certificate-lifecycle.sh`](./certificate-lifecycle.sh) | Full mTLS certificate lifecycle (sign, get, revoke) |
