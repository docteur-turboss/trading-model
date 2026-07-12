# Message Delivery Service

## Overview

Internal messaging backbone for inter-service communication. Provides topic-based publish/subscribe over HTTP with in-memory subscription management, configurable delivery semantics (at-most-once, at-least-once, exactly-once), TTL expiration, and Dead Letter Queue routing. Used by all microservices via the `@trading-model/broker-message` SDK.

## Prerequisites

- Node.js 20+
- MongoDB 7+ (for message persistence — planned)
- Access to a running [Discovery Server](../discovery-server/README.md) (service registry)
- TLS certificates for mTLS communication

## Installation

```bash
# From the monorepo root
npm install

# Or from this directory
cd services/message-manager
npm install
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
| `SERVICE_NAME`                    | Service identity for registry | `message-delivery-service` |
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
npm run dev

# Production build
npm run build
node dist/src/app/index.js
```

## Testing

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Scripts

| Script           | Description                           |
| ---------------- | ------------------------------------- |
| `npm run dev`    | Run in development mode via `ts-node` |
| `npm run build`  | Compile TypeScript to `dist/`         |
| `npm test`       | Execute all tests                     |
| `npm run eslint` | Run ESLint on source files            |

## Project Structure

```
src/
├── app/                        # Service bootstrap & HTTP server
│   ├── index.ts                # Entry point (lifecycle via createBootstrap)
│   └── server.ts               # Express server factory (createSecureServer)
├── config/
│   ├── env.ts                  # Zod-validated environment variables
│   ├── address-manager.ts      # Service discovery client setup
│   └── message-manager.ts      # Broker singleton & route binder
├── messaging/
│   ├── index.ts                # BrokerModule entry point (composition root)
│   ├── broker.type.ts          # IdentifyType, BrokerConfig type definitions
│   ├── core/                   # Messaging domain logic
│   │   ├── broker.ts           # Broker facade (publish, subscribe, unsubscribe)
│   │   ├── dispatcher.ts       # In-memory subscription registry & message routing
│   │   ├── message.ts          # Message envelope & metadata interfaces
│   │   └── subscription.ts     # Per-subscriber delivery (retry, TTL, DLQ)
│   └── transport/              # HTTP transport layer
│       ├── http.controller.ts  # Request handlers (subscribe, unsubscribe, publish)
│       ├── http.routes.ts      # Express route definitions
│       └── validation/
│           └── broker.schema.ts # Zod schemas for request validation

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
