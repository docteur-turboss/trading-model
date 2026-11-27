# Examples

This directory contains executable examples for interacting with the trading-model platform.

## Prerequisites

- Docker Compose running with core services (see [Quick Start](../docs/getting-started/quickstart.md))
- The scripts call the gateway through the `edge-proxy` on `http://localhost:8449` (`API_GATEWAY`). Services only accept SPIFFE mTLS clients (ADR-0011), so nothing is called directly
- `ADMIN_TOKEN`: one of the gateway's `AUTH_TOKENS`

## Available Examples

| File                                                     | Description                                         |
| -------------------------------------------------------- | --------------------------------------------------- |
| [`view-audit-trail.sh`](./view-audit-trail.sh)           | Query recent audit events                           |
