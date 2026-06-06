# Architecture — AI Trading Platform

## Overview

This project is an **AI-driven trading platform** built as a **monorepo** using npm workspaces. It ingests heterogeneous data (market, financial, economic, social), trains transformer-based models and reinforcement learning agents (optimized by a genetic algorithm), and eventually executes trades through a centrally monitored gateway.

The system is in **early development**. No component is production-ready.

## Monorepo Structure

```
trading-model/
├── packages/          # Shared libraries (npm workspace packages)
│   ├── common/           @trading-model/common
│   ├── address-manager/  @trading-model/address-manager
│   └── broker-message/   @trading-model/broker-message
├── services/          # Microservices (npm workspace packages)
│   ├── discovery-server/
│   ├── financial-scraper/
│   ├── message-manager/
│   └── trader-trainer/
├── docs/              # Documentation
├── package.json       # Root workspace config
└── README.md
```

## Packages (Shared Libraries)

| Package                          | Purpose                                                                                                                                                                                                                                                                      | Dependencies            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `@trading-model/common`          | Logger, HTTP client, middleware (catchError, MTLSAuth, ResponseProtocole), server factories (createSecureServer, createBootstrap), env validation (BaseEnvSchema, validateEnv), event types, service types, delivery mode enum, error classes, crypto utilities, shared DTOs | None (only npm deps)    |
| `@trading-model/address-manager` | Service discovery client, token manager, service cache with health checking, scheduler/jobs                                                                                                                                                                                  | common                  |
| `@trading-model/broker-message`  | Inter-service messaging SDK: message manager client, event emitter, message controller/routes, validation schemas                                                                                                                                                            | common, address-manager |

## Services (Microservices)

### Discovery-Server (Port 8443)

Central service registry with mTLS-secured endpoints:

- `POST /register` — register a service instance
- `POST /heartbeat` — keep lease alive
- `POST /token/rotate` — rotate authentication tokens
- `GET /services` — list all services
- `GET /services/:name` — list instances by name
- `GET /services/:name/:id` — get specific instance
  In-memory storage with TTL-based lease eviction.

### Financial Scraper (Port 8445)

Real-time market data ingestion from Binance:

**Data Collection:**

- Order book snapshots (in-memory storage for fast range queries)
- Recent & historical trades (persisted to MySQL via `ts-sql-query`)
- Candlestick / OHLCV series (persisted to MySQL)
- 24hr ticker stats, trading day ticker, price ticker, book ticker (persisted to MySQL)

**Scheduling:**

- `node-cron` orchestrates per-symbol `BinanceWorker` instances with concurrency control via `p-limit`
- Each worker fetches 6 data types in parallel, normalizes responses, and publishes events to the message bus

**HTTP API:**

- `GET /trade/*` — trades by source / symbol / timestamp
- `GET /ticker/*` — tickers by source / symbol / timestamp
- `GET /candles/*` — candlesticks by source / symbol / timestamp
- `GET /orderbook/*` — order books by source / symbol / timestamp range

**Key design features:**

- Token-bucket rate limiter respects Binance API weight costs per endpoint
- Exponential backoff retry (5 retries, 300ms–10s) for transient failures
- Zod-validated environment variables for fail-fast misconfiguration detection
- Integrates `@trading-model/address-manager` (service discovery) and `@trading-model/broker-message` (event publishing)

See [services/financial-scraper/docs/architecture.md](../services/financial-scraper/docs/architecture.md) for full details.

### Message Manager / Message Delivery Service (Port 8444)

Internal messaging backbone for inter-service communication:

**Messaging Model:**

- Topic-based publish/subscribe over HTTP
- In-memory subscription registry with instance-level deduplication
- Three delivery semantics: `AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EXACTLY_ONCE`
- TTL-based message expiration with Dead Letter Queue routing
- Parallel dispatch to all subscribers of a topic

**HTTP API:**

- `POST /message` — publish a message to a topic
- `POST /subscription` — subscribe to a topic
- `DELETE /subscription` — unsubscribe from a topic

**Key design features:**

- Zod-validated request bodies for fail-fast misconfiguration detection
- TLS-secured callbacks to subscriber services via mTLS
- Service discovery integration (`@trading-model/address-manager`) for target resolution
- Fluent `MessageMetadata` builder for constructing typed message envelopes
- Subscribers context with `ack` / `nack` / `deadLetter` controls

**Client SDK:**

- `@trading-model/broker-message` SDK provides a high-level client for subscribing, publishing, and handling incoming messages with typed event emitters.

See [services/message-manager/README.md](../services/message-manager/README.md) for full details.

### Trader-Trainer (Port 3000)

Core ML training engine:

- Genetic Algorithm engine for strategy evolution
- Custom neural network implementation
- Trading agent with simulated wallet
- Reinforcement learning state manager
- Express server with mTLS-secured routes

## Dependency Graph

```
@trading-model/common
  ↑                    ↑
  |                    |
@trading-model/        |
address-manager        |
  ↑                    |
  |                    |
@trading-model/broker-message ---
  ↑         ↑           ↑          ↑
  |         |           |          |
Discovery  Financial   Message    Trader-
Server     Scrapper    Manager    Trainer
```

## Technology Stack

| Layer      | Technology                                           |
| ---------- | ---------------------------------------------------- |
| Runtime    | Node.js                                              |
| Language   | TypeScript (ES2020; module: node16 or commonjs)      |
| API        | Express.js                                           |
| Security   | mTLS (all services)                                  |
| Database   | MongoDB (message-manager), MySQL (financial-scraper) |
| Validation | Zod                                                  |
| Scheduling | node-cron                                            |
| Formatting | Prettier                                             |
| Linting    | ESLint 10 flat config                                |

## Security Model

- All inter-service communication uses **HTTPS with mutual TLS** (mTLS).
- No service trusts another without explicit certificate validation.
- The Discovery-Server issues and rotates tokens.
- Live trading will be gated by risk limits, capital exposure constraints, and fail-safe mechanisms (planned).

## Known Technical Debt

1. **Mixed test conventions**: Both `.spec.ts` and `.test.ts` suffixes used across services.
2. **Legacy `config/*` path alias**: Some service tsconfigs still define a `config/*` path alias (`./src/config/*`) that should be replaced with `node16` resolution.
3. **ESLint warnings**: ~50 lint errors remain across the codebase (unused variables, `any` types, empty interfaces, prefer-const).
