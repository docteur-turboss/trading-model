# Message Delivery Service

## Overview

Internal messaging backbone for inter-service communication. Provides topic-based publish/subscribe over HTTP with in-memory subscription management, configurable delivery semantics (at-most-once, at-least-once, exactly-once), TTL expiration, and Dead Letter Queue routing. Used by all microservices via the `@trading-model/broker-message` SDK.

## Prerequisites

- Node.js 20+
- No external database required (in-memory dispatcher; local JSONL dead-letter file)
- Access to a running [Discovery Server](../discovery-server/README.md) (service registry)
- mTLS automatique via SPIRE (ADR-0011) — aucun certificat manuel à générer

## Installation

```bash
# From the monorepo root
bun install

# Or from this directory
cd services/message-manager
bun install
```

## Configuration

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

See [.env.example](./.env.example) for all available variables.

## Environment Variables

| Variable                          | Description                   | Default                    |
| --------------------------------- | ----------------------------- | -------------------------- |
| `NODE_ENV`                        | Runtime environment           | `development`              |
| `PORT`                            | HTTPS server port             | `8445`                     |
| `TLS_KEY_PATH`                    | Path to TLS private key       | —                          |
| `TLS_CERT_PATH`                   | Path to TLS certificate       | —                          |
| `TLS_CA_PATH`                     | Path to CA certificate        | —                          |
| `SERVICE_NAME`                    | Service identity for registry | `message-manager`          |
| `INSTANCE_ID`                     | Unique instance identifier    | —                          |
| `ADDRESS_MANAGER_URL`             | Discovery server URL          | —                          |
| `CACHE_TTL_MS`                    | Service cache TTL             | `84000000`                 |
| `SERVICE_PING_TIMEOUT_MS`         | Health-check ping timeout     | `84000000`                 |
| `TOKEN_REFRESH_INTERVAL_MS`       | Auth token refresh interval   | `84000000`                 |
| `TTL_REFRESH_INTERVAL_MS`         | Lease TTL refresh interval    | `84000000`                 |
| `MESSAGE_BUS_INIT_TIMEOUT_MS`     | Broker initialization timeout | `84000000`                 |
| `MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS` | Broker shutdown timeout       | `84000000`                 |
| `ERROR_URL_WEBHOOK`               | Webhook for error alerts      | —                          |
| `LOG_LEVEL`                       | Logging verbosity             | `info`                     |

## Running

```bash
# Development (with ts-node)
bun run dev

# Production build
bun run build
node dist/application/index.js
```

## Testing

```bash
# All tests
bun run test

# With coverage
bun run test:coverage

# Watch mode
bun run test:watch
```

## Scripts

| Script           | Description                           |
| ---------------- | ------------------------------------- |
| `bun run dev`        | Run in development mode via `ts-node`  |
| `bun run build`      | Compile TypeScript to `dist/`          |
| `bun run test`       | Execute all tests                      |
| `bun run test:coverage` | Execute all tests with coverage    |

## Project Structure

```
src/
├── application/                # Service bootstrap & orchestration
│   ├── index.ts                # Entry point (lifecycle via createBootstrap)
│   ├── server.ts               # Express HTTPS server factory (createServiceServer)
│   ├── ports/                  # Application ports (interfaces)
│   └── services/               # Orchestration (dispatcher, subscription registry, ack/address/delivery handling)
├── adapters/                   # Driving (inbound) & driven (outbound) adapters
│   ├── inbound/                # HTTP transport layer
│   │   ├── http.controller.ts  # Request handlers (subscribe, unsubscribe, publish)
│   │   ├── http.routes.ts      # Express route definitions
│   │   └── validation/
│   │       ├── broker.schema.ts          # Zod schemas for request validation
│   │       └── validate-schema.middleware.ts  # Validation middleware
│   └── outbound/
│       └── http-message-delivery.ts   # HTTP delivery + JSONL dead-letter
├── domain/                     # Domain types & business rules
├── infrastructure/
│   ├── config/env.ts           # Zod-validated environment variables
│   └── fallback/
│       └── dlq-repository.ts   # Local JSONL dead-letter store
├── config/
│   ├── address-manager.ts      # Service discovery client setup
│   ├── container.ts            # Broker composition root (HTTP client, DLQ, dispatcher, routes)
│   └── message-manager.ts      # Broker singleton & route binder
└── shared/                     # Shared types (broker.type.ts)

tests/
├── unit/                       # Unit tests mirroring src structure
├── integration/                # Integration test for broker system
├── fixtures/                   # Test fixture data
└── helpers/                    # Test utility factories
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the detailed architecture documentation.

## API Endpoints

See [API.md](./API.md) for the REST API reference.
