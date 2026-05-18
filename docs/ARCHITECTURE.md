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
│   ├── Discovery-Server/
│   ├── Financial_Scrapper/
│   ├── Message-Manager/
│   └── Trader-Trainer/
├── docs/              # Documentation
├── package.json       # Root workspace config
└── README.md
```

## Packages (Shared Libraries)

| Package | Purpose | Dependencies |
|---|---|---|
| `@trading-model/common` | Logger, HTTP client, middleware (catchError, MTLSAuth, ResponseProtocole), event types, service types, delivery mode enum, error classes | None (only npm deps) |
| `@trading-model/address-manager` | Service discovery client, token manager, service cache with health checking, scheduler/jobs | common |
| `@trading-model/broker-message` | Inter-service messaging SDK: message manager client, event emitter, message controller/routes, validation schemas | common, address-manager |

## Services (Microservices)

### Discovery-Server (Port 8443)
Central service registry with mTLS-secured endpoints:
- `POST /register` — register a service instance
- `POST /heartbeat` — keep lease alive
- `POST /token/rotate` — rotate authentication tokens
- `GET /services` — list all services
- `GET /services/:name` — list instances by name
- `GET /services/:name/:id` — get specific instance
- `GET /dump` — dump full registry (debug)

In-memory storage with TTL-based lease eviction.

### Financial Scrapper (Port 8444)
Market data ingestion via Binance API:
- `GET /trade/*` — recent trades
- `GET /ticker/*` — 24hr ticker stats
- `GET /candles/*` — candlestick series
- `GET /orderbook/*` — order book snapshots

Data stored in MongoDB. Scheduled collection via node-cron jobs. Integrates address-manager and broker-message for service discovery and event publishing.

### Message-Manager (Port 8445)
Internal messaging backbone between microservices:
- Publish/subscribe with topic routing
- HTTP transport layer
- MongoDB persistence for messages
- Zod schema validation

### Trader-Trainer (Port 3001)
Core ML training engine:
- Genetic Algorithm engine for strategy evolution
- Custom neural network implementation
- Trading agent with simulated wallet
- Reinforcement learning state manager
- Express server (no mTLS)

## Dependency Graph

```
@trading-model/common
  ↑                    ↑
  |                    |
@trading-model/        |
address-manager        |
  ↑                    |
  |                    |
@trading-model/broker-message
  ↑         ↑
  |         |
Discovery  Financial  Message   Trader-
Server     Scrapper   Manager   Trainer
```

**Known issue**: Services currently import via a legacy `cash-lib` alias (pointing to a removed `lib/` directory) instead of the workspace packages. This is a critical refactoring target.

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript (ES2020, CommonJS) |
| API | Express.js |
| Security | mTLS (except Trader-Trainer) |
| Database | MongoDB |
| Validation | Zod |
| Scheduling | node-cron |
| Formatting | Prettier |
| Linting | ESLint 10 flat config |

## Security Model

- All inter-service communication uses **HTTPS with mutual TLS** (mTLS).
- No service trusts another without explicit certificate validation.
- The Discovery-Server issues and rotates tokens.
- Live trading will be gated by risk limits, capital exposure constraints, and fail-safe mechanisms (planned).

## Known Technical Debt

1. **`cash-lib` legacy alias**: Services import from a dead path instead of `@trading-model/*` packages.
2. **Server bootstrap duplication**: HTTPS + mTLS server setup, lifecycle management, and env validation are copy-pasted across services.
3. **Inconsistent naming**: Mix of kebab-case, PascalCase, and snake_case across files and directories.
4. **Mixed test conventions**: Both `.spec.ts` and `.test.ts` suffixes used.
5. **Duplicate error hierarchies**: Three nearly identical error base classes (`AddressManagerBaseError`, `MessageManagerBaseError`, `AgentBaseError`).

See [PLAN.md](./branch-docs/PLAN.md) for the detailed refactoring roadmap.