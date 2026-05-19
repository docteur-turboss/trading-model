# Financial Scraper

## Overview

Market data ingestion service that fetches real-time financial data from Binance (and potentially other exchanges). It collects order books, trades, candlesticks, and tickers, normalizes them into a unified schema, persists them to MySQL (or in-memory for order books), and publishes events to the message bus for downstream consumers.

## Prerequisites

- Node.js 20+
- MySQL 8+ (for trades, candles, tickers persistence)
- Access to a running [Discovery Server](../discovery-server/README.md) (service registry)
- TLS certificates for mTLS communication

## Installation

```bash
# From the monorepo root
npm install

# Or from this directory
cd services/financial-scraper
npm install
```

## Configuration

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

See [.env.example](./.env.example) for all available variables.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTPS server port | `8444` |
| `TLS_KEY_PATH` | Path to TLS private key | — |
| `TLS_CERT_PATH` | Path to TLS certificate | — |
| `TLS_CA_PATH` | Path to CA certificate | — |
| `SERVICE_NAME` | Service identity for registry | `financial-scraper-service` |
| `INSTANCE_ID` | Unique instance identifier | — |
| `ADDRESS_MANAGER_URL` | Discovery server URL | — |
| `DB_USER` | MySQL user | — |
| `DB_PASSWORD` | MySQL password | — |
| `DB_NAME` | MySQL database name | — |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `ERROR_URL_WEBHOOK` | Webhook for error alerts | — |

## Running

```bash
# Development (with ts-node)
npm run dev

# Production build
npm run build
node dist/app/index.js
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

| Script | Description |
|---|---|
| `npm run dev` | Run in development mode via `ts-node` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Execute all tests |
| `npm run test:coverage` | Execute tests with coverage report |
| `npm run test:watch` | Execute tests in watch mode |

## Project Structure

```
src/
├── app/                        # Service bootstrap & HTTP server
│   ├── index.ts                # Entry point
│   └── server.ts               # Express server factory
├── clients/
│   ├── binance/                # Binance API client
│   │   ├── binance.client.ts   # API call functions with rate-limit weights
│   │   ├── endpoints.ts        # URL builders
│   │   ├── normalizer.ts       # Response normalizer
│   │   └── weights.ts          # Binance API weight definitions
│   └── http/                   # REST API controllers & routes
│       ├── controller.ts       # Request handlers
│       └── routes.ts           # Route definitions
├── config/
│   ├── address-manager.ts      # Service discovery client setup
│   ├── db.ts                   # MySQL connection pool
│   ├── env.ts                  # Zod-validated environment variables
│   ├── follows.ts              # Tracked symbols configuration
│   ├── http.ts                 # Axios client factory (rate-limited, retry)
│   └── message-manager.ts      # Message bus client setup
├── infra/market-data/          # Data access & persistence layer
│   ├── market-data.controller.ts  # Application-level persistence orchestration
│   ├── market-data.model.ts    # Repository facade
│   ├── market-data.types.ts    # Re-exported entity types
│   └── schema/                 # Per-entity storage implementations
│       ├── candles-schema.ts   # Candlestick MySQL table & queries
│       ├── orderBook.schema.ts # Order book in-memory storage
│       ├── ticker24h.schema.ts # Ticker MySQL table & queries
│       └── trades.schema.ts    # Trades MySQL table & queries
├── job/
│   ├── cron/binance.cron.ts    # Cron orchestrator (schedules workers)
│   └── worker/binance.worker.ts # Per-symbol data fetch & persist worker
├── types/
│   ├── axios.d.ts              # Axios module augmentation (weight property)
│   └── binance.api.ts          # Binance API response type definitions
└── utils/
    └── sleep.ts                # Async sleep utility

tests/
├── unit/                       # Unit tests mirroring src structure
├── integration/                # Integration tests for persistence flows
├── fixtures/                   # Mock API response fixtures
└── helpers/                    # Test utility factories
```

## Architecture

See [docs/architecture.md](./docs/architecture.md) for the detailed architecture documentation.

## API Endpoints

See [docs/API.md](docs/API.md) for the REST API reference.
