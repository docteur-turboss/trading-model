# Financial Scraper — Architecture

## Overview

The Financial Scraper is a microservice within the AI Trading Platform responsible for ingesting real-time market data from external APIs (starting with Binance). It normalizes heterogeneous API responses into unified domain entities, persists them to storage, and publishes normalized events to the message bus for downstream consumers (analysis, backtesting, signal generation, training).

## Data Flow

```
Binance API
     │
     ▼
binance.client.ts  ─── Axios instance (rate-limited, retry-capable)
     │
     ▼
BinanceNormalizer  ─── Raw → Normalized entity conversion
     │
     ▼
BinanceWorker.run() ─── Per-symbol orchestration
     │                       │
     │                       ▼
     │              MessageManager.post.indirect()
     │              (6 events published to message bus)
     │
     ▼
MarketDataController.persist()
     │
     ├── MarketDataModel.insertCandles()   → MySQL (market_candles)
     ├── MarketDataModel.insertTrades()    → MySQL (market_trades)
     ├── MarketDataModel.insertOrderBook() → In-memory Map
     └── MarketDataModel.insertTicker()    → MySQL (market_tickers)
```

## Scheduling Flow

```
node-cron
    │
    ▼
BinanceCronOrchestrator
    │
    ├── p-limit (concurrency = min(cpus × 2, symbols.length))
    │
    └── For each symbol:
         └── BinanceWorker.run()
              ├── binance.client.*()    (6 parallel API calls)
              ├── BinanceNormalizer.*() (6 parallel normalizations)
              ├── MessageManager.post   (6 event publications)
              └── MarketDataController.persist()
```

## Component Breakdown

### 1. HTTP Client Layer (`src/config/http.ts`)

A configurable Axios instance factory (`createHttpClient`) that provides:

- **Token-bucket rate limiter** — per-baseURL bucket with configurable capacity (default: 1200 tokens) and refill rate (20 tokens/sec). The `weight` property on each request config determines how many tokens are consumed, mirroring Binance's documented API weight system.
- **Exponential backoff retry** — up to 5 retries with 300ms base delay, max 10s. Triggers on network errors, 5xx, 403, 408, 429, and 418 status codes.
- **Type augmentation** — `AxiosRequestConfig` is augmented to accept a `weight?: number` field via declaration merging (`src/types/axios.d.ts`).

```typescript
const binance = httpClients.binance;
// weight is consumed by the rate limiter before the request is sent
const response = await binance.get(url, { weight: 5 });
```

### 2. Binance Client (`src/clients/binance/`)

| Module | Responsibility |
|---|---|
| `endpoints.ts` | Pure functions that construct Binance REST API URLs for 9 endpoints |
| `weights.ts` | Pure functions that compute Binance API weight costs for each endpoint |
| `binance.client.ts` | 9 async functions (`getOrderBook`, `getRecentTrades`, `CandlestickData`, etc.) each calling the Axios instance with the correct weight |
| `normalizer.ts` | `BinanceNormalizer` class (static methods) converting raw API shapes to internal entity types (`OrderBookEntity`, `TradeEntity`, `CandleEntity`, `TickerEntity`) |

### 3. Worker & Cron (`src/job/`)

| Component | File | Role |
|---|---|---|
| `BinanceWorker` | `worker/binance.worker.ts` | Per-symbol worker: fetches all 6 data types in parallel, normalizes, publishes to message bus, returns result |
| `BinanceCronOrchestrator` | `cron/binance.cron.ts` | Schedules workers on a cron expression, manages concurrency with `p-limit`, prevents overlapping runs |

The worker publishes 6 events to the message bus for each symbol:
- `FetchCandlestick` → `fetchCandlestickSeries`
- `FetchOrderbook` → `fetchOrderBookSnapshot`
- `FetchTicker24hr` → `fetch24hrTickerStats`
- `FetchBookTicker` → `fetchOrderBookTickerSnapshot`
- `FetchPriceTicker` → `fetchPriceTickerSnapshot`
- `FetchRecentTrades` → `fetchRecentTrades`

### 4. Persistence Layer (`src/infra/market-data/`)

| Component | Storage | Tables/Structures |
|---|---|---|
| `schema/trades.schema.ts` | MySQL (`mysql2` + `ts-sql-query`) | `market_trades` — id, symbol, market, source, side, price, quantity, tradeId, timestamp |
| `schema/candles-schema.ts` | MySQL | `market_candles` — id, symbol, market, source, interval_value, OHLCV, trades, timestamps |
| `schema/ticker24h.schema.ts` | MySQL | `market_tickers` — id, symbol, market, source, OHLC, volume, timestamps |
| `schema/orderBook.schema.ts` | In-memory (`Map`) | Indexed by symbol, source, market, timestamp with reverse lookup maps |

The `MarketDataModel` class provides a unified facade over all schema modules. `MarketDataController.persist()` conditionally delegates to it.

### 5. REST API (`src/clients/http/`)

| Method | Path | Description |
|---|---|---|
| GET | `/trade/sources/:source` | Trades by source |
| GET | `/trade/symbols/:symbol` | Trades by symbol |
| GET | `/trade/timestamp/:timestamp` | Trades by timestamp |
| GET | `/ticker/sources/:source` | Tickers by source |
| GET | `/ticker/symbols/:symbol` | Tickers by symbol |
| GET | `/ticker/timestamp/:timestamp` | Tickers by timestamp |
| GET | `/candles/sources/:source` | Candles by source |
| GET | `/candles/symbols/:symbol` | Candles by symbol |
| GET | `/candles/timestamp/:timestamp` | Candles by timestamp |
| GET | `/orderbook/sources/:source` | Order books by source |
| GET | `/orderbook/symbols/:symbol` | Order books by symbol |
| GET | `/orderbook/after/timestamp/:timestamp` | Order books after timestamp |
| GET | `/orderbook/before/timestamp/:timestamp` | Order books before timestamp |

All routes use Zod-validated parameters and return standardized error responses via `ResponseException`.

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Token-bucket rate limiting** | Binance enforces API weight limits per minute; a token bucket provides smooth request pacing vs. burst-and-wait |
| **In-memory order books** | Order book snapshots change rapidly and are queried by timestamp ranges; MySQL is not suitable for this access pattern |
| **MySQL for trades/candles/tickers** | These are append-only time-series with stable schemas; SQL allows efficient range queries and joins |
| **Separate worker per symbol** | Avoids one slow symbol blocking others; `p-limit` caps total concurrency |
| **Message bus publishing** | Decouples ingestion from consumption; other services (trainer, signal generator) consume normalized data without depending on the scraper's database |
| **Zod-validated env vars** | Fail-fast on misconfiguration; clear error messages at startup |
| **Path aliases** | `config/*`, `infra/*`, `clients/*`, `job/*`, `types/*`, `utils/*` map to `src/` subdirectories for clean imports |

## Dependencies

### Internal (Monorepo Workspaces)

| Package | Role |
|---|---|
| `@trading-model/common` | Bootstrap, server factory (`createSecureServer`), shared types, error classes, event types |
| `@trading-model/address-manager` | Service discovery client (register, heartbeat, token rotation) |
| `@trading-model/broker-message` | Message bus SDK (publish events with topics and metadata) |

### External

| Package | Role |
|---|---|
| `axios` | HTTP client for Binance API |
| `express` | Web framework for REST API |
| `express-rate-limit` | Rate limiting middleware (HTTP layer) |
| `helmet` | Security HTTP headers |
| `node-cron` | Cron scheduling for data collection |
| `mysql2` | MySQL database driver |
| `ts-sql-query` | Type-safe SQL query builder |
| `p-limit` | Promise concurrency limiter |
| `zod` | Schema validation (env vars, request params) |
| `uuid` | UUID generation for message tracking |

## Configuration

All configuration is validated at startup via Zod schemas from `@trading-model/common`. The service requires:

- **TLS certificates** — all inter-service communication uses mutual TLS
- **MySQL connection** — user, password, host, port, database name
- **Discovery Server URL** — for service registration and heartbeat
- **Cron schedule** — defined in `BinanceCronOrchestrator` configuration
- **Tracked symbols** — defined in `src/config/follows.ts` (~2500+ Binance pairs)

## Error Handling

- **HTTP layer**: Centralized error handler returns 400 (validation), 404 (not found), 500 (internal)
- **Worker layer**: Each symbol worker is isolated; failures don't block other symbols
- **HTTP client**: Automatic retry with exponential backoff for transient network/server errors
- **Rate limiter**: Blocks until tokens are available (no error — natural pacing)

## Testing Strategy

| Level | Focus | Tools |
|---|---|---|
| **Unit** | Client functions (URLs, weights), normalizers, workers (mocked API), utils | Jest, manual mocks |
| **Integration** | Persistence pipeline (MarketDataController + model), in-memory order book storage | Jest, real in-memory stores |
| **Fixtures** | Mock Binance API responses for all endpoints | Static fixture files |
