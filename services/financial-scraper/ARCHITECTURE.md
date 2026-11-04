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
BinanceMarketDataSource ─── MarketDataSourcePort (domain): snapshot per symbol
     │
     ▼
WorkerOrchestrator ─── fetch → publish → persist, per symbol
     │
     ├── BrokerMarketDataPublisher ─── MarketDataPublisherPort (domain)
     │        MessageManager.post.indirect() (6 events on the message bus)
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
ScrapeCronOrchestrator (deps built by config/container.ts)
    │
    ├── p-limit (concurrency = min(cpus × 2, symbols.length))
    │
    └── WorkerOrchestrator, for each symbol:
         ├── source.fetchSnapshot()   BinanceMarketDataSource:
         │                            6 parallel API calls + normalization
         ├── publisher.publish()      6 event publications (never throws)
         └── persist()                MarketDataController.persist()
```

## Component Breakdown

### 1. HTTP Client Layer (`src/config/http.ts`)

A configurable Axios instance factory (`createHttpClient`) that provides:

- **Token-bucket rate limiter** — per-baseURL bucket with configurable capacity (default: 1200 tokens) and refill rate (20 tokens/sec). The `weight` property on each request config determines how many tokens are consumed, mirroring Binance's documented API weight system.
- **Exponential backoff retry** — up to 5 retries with 300ms base delay, max 10s. Triggers on network errors, 5xx, 408 and 429. Never on 403 (Binance WAF), 418 (IP ban) or 451 (restricted location): see ADR-0026.
- **Type augmentation** — `AxiosRequestConfig` is augmented to accept a `weight?: number` field via declaration merging (`src/infrastructure/http/axios.d.ts`).

```typescript
const binance = httpClients.binance;
// weight is consumed by the rate limiter before the request is sent
const response = await binance.get(url, { weight: 5 });
```

### 2. Binance Client (`src/adapters/outbound/binance/`)

| Module              | Responsibility                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoints.ts`      | Pure functions that construct Binance REST API URLs for 9 endpoints                                                                                              |
| `weights.ts`        | Pure functions that compute Binance API weight costs for each endpoint                                                                                           |
| `binance.client.ts` | 9 async functions (`getOrderBook`, `getRecentTrades`, `getCandlestickData`, etc.) each calling the Axios instance with the correct weight                        |
| `normalizer.ts`     | `BinanceNormalizer` class (static methods) converting raw API shapes to internal entity types (`OrderBookEntity`, `TradeEntity`, `CandleEntity`, `TickerEntity`) |

### 3. Scrape cycle (`src/adapters/inbound/cron/`, `src/application/worker-orchestrator.ts`, `src/domain/ports/`)

| Component                   | File                                                      | Role                                                                                                 |
| --------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `MarketDataSourcePort`      | `domain/ports/market-data-source.port.ts`                 | A market data provider: `fetchSnapshot(request)` returns a normalized `MarketDataSnapshot`            |
| `MarketDataPublisherPort`   | `domain/ports/market-data-publisher.port.ts`              | Publishes a snapshot to the subscribers; never rejects, returns the parts that failed               |
| `BinanceMarketDataSource`   | `adapters/outbound/binance/binance-market-data-source.ts` | The only source today (ADR-0026): 6 parallel public API calls, a failed one leaves its part out     |
| `BrokerMarketDataPublisher` | `adapters/outbound/broker/broker-market-data.publisher.ts` | One event per part present through message-manager, fresh metadata per snapshot                     |
| `WorkerOrchestrator`        | `application/worker-orchestrator.ts`                      | Per symbol: fetch → persist → publish (not awaited) of the next persisted candles from the MySQL publish cursor |
| `ScrapeCronOrchestrator`    | `adapters/inbound/cron/scrape.cron.ts`                    | Runs the cycle on a cron expression with `p-limit`, prevents overlapping runs                        |

Adding a source means an adapter implementing `MarketDataSourcePort` and a value of `DataSource`; the cycle does not change.

The publisher sends 6 events to the message bus for each symbol:

- `FetchCandlestick` → `fetchCandlestickSeries`
- `FetchOrderbook` → `fetchOrderBookSnapshot`
- `FetchTicker24hr` → `fetch24hrTickerStats`
- `FetchBookTicker` → `fetchOrderBookTickerSnapshot`
- `FetchPriceTicker` → `fetchPriceTickerSnapshot`
- `FetchRecentTrades` → `fetchRecentTrades`

### 4. Persistence Layer (`src/adapters/outbound/persistence/`)

Storage schemas live in `src/adapters/outbound/persistence/schema/`; market data types in `src/domain/market-data.types.ts`. The persistence use case `createMarketDataController()` (`src/application/market-data.controller.ts`) depends on `MarketDataRepositoryPort` (`src/domain/ports/`); `src/config/container.ts` wires it to the MySQL `MarketDataModel` and exports the `MarketDataController` instance plus the scrape-cycle dependencies of `WorkerOrchestrator`.

| Component                    | Storage                           | Tables/Structures                                                                        |
| ---------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| `schema/trades.schema.ts`    | MySQL (`mysql2` + `ts-sql-query`) | `market_trades` — id, symbol, market, source, side, price, quantity, tradeId, timestamp  |
| `schema/candles-schema.ts`   | MySQL                             | `market_candles` — id, symbol, market, source, interval_value, OHLCV, trades, timestamps |
| `schema/ticker24h.schema.ts` | MySQL                             | `market_tickers` — id, symbol, market, source, OHLC, volume, timestamps                  |
| `schema/orderBook.schema.ts` | In-memory (`Map`)                 | Indexed by symbol, source, market, timestamp with reverse lookup maps                    |

The `MarketDataModel` class (in `src/adapters/outbound/persistence/market-data.model.ts`) provides a unified facade over all schema modules. `MarketDataController.persist()` (built in `src/config/container.ts`) conditionally delegates to it.

### 5. REST API (`src/adapters/inbound/http/`)

| Method | Path                                     | Description                  |
| ------ | ---------------------------------------- | ---------------------------- |
| GET    | `/trade/sources/:source`                 | Trades by source             |
| GET    | `/trade/symbols/:symbol`                 | Trades by symbol             |
| GET    | `/trade/timestamp/:timestamp`            | Trades by timestamp          |
| GET    | `/ticker/sources/:source`                | Tickers by source            |
| GET    | `/ticker/symbols/:symbol`                | Tickers by symbol            |
| GET    | `/ticker/timestamp/:timestamp`           | Tickers by timestamp         |
| GET    | `/candles/sources/:source`               | Candles by source            |
| GET    | `/candles/symbols/:symbol`               | Candles by symbol            |
| GET    | `/candles/timestamp/:timestamp`          | Candles by timestamp         |
| GET    | `/orderbook/sources/:source`             | Order books by source        |
| GET    | `/orderbook/symbols/:symbol`             | Order books by symbol        |
| GET    | `/orderbook/after/timestamp/:timestamp`  | Order books after timestamp  |
| GET    | `/orderbook/before/timestamp/:timestamp` | Order books before timestamp |
| GET    | `/signals/assets/:assetId?from=&to=`     | Signals of an asset and its sector in a window (ADR-0036) |

All routes use Zod-validated parameters and return standardized error responses via `ResponseException`.

### 6. Signals (ADR-0036)

Collection of the sources of every dimension declared in the source registry; see `docs/services/financial-scraper.md#signals-adr-0036`.

| Component | Location | Responsibility |
| --- | --- | --- |
| Schema v1 | `domain/signals.ts` | `Asset`, `Dimension`, `Source`, `Signal` (Zod), `SIGNAL_SCHEMA_VERSION` |
| Source registry | `config/signal-registry.json`, `config/signal-registry.ts` | Assets and sources, checked at startup (`parseSignalRegistry`) |
| `SignalCronScheduler` | `adapters/inbound/cron/signal.cron.ts` | One cron task per source, overlapping ticks skipped |
| `SignalCollector` | `application/signal-collector.ts` | Per request: worker → adapter → schema check → store; counts `fs_signal_collections_total` |
| `rest_api` worker | `adapters/outbound/signal-sources/rest-api.worker.ts` | GET, JSON, 10 s timeout |
| Source adapters | `adapters/outbound/signal-sources/` (`SOURCE_ADAPTERS`) | ECB SDMX series, SEC EDGAR companyconcept, NWS latest observation, Wikimedia page views |
| `MySqlSignalStore` | `adapters/outbound/persistence/signal-store.ts` | Table `signals`: idempotent insert, asset + sector window query |

## Key Design Decisions

| Decision                             | Rationale                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Token-bucket rate limiting**       | Binance enforces API weight limits per minute; a token bucket provides smooth request pacing vs. burst-and-wait                                      |
| **In-memory order books**            | Order book snapshots change rapidly and are queried by timestamp ranges; MySQL is not suitable for this access pattern                               |
| **MySQL for trades/candles/tickers** | These are append-only time-series with stable schemas; SQL allows efficient range queries and joins                                                  |
| **Separate worker per symbol**       | Avoids one slow symbol blocking others; `p-limit` caps total concurrency                                                                             |
| **Message bus publishing**           | Decouples ingestion from consumption; other services (trainer, signal generator) consume normalized data without depending on the scraper's database |
| **Zod-validated env vars**           | Fail-fast on misconfiguration; clear error messages at startup                                                                                       |
| **Path aliases**                     | `config/*` maps to `src/config/` (the other legacy aliases were removed with the hexagonal layout)                                     |

## Dependencies

### Internal (Monorepo Workspaces)

| Package                          | Role                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `@trading-model/common`          | Bootstrap, server factory (`createSecureServer`), shared types, error classes, event types |
| `@trading-model/address-manager` | Service discovery client (register, heartbeat, token rotation)                             |
| `@trading-model/broker-message`  | Message bus SDK (publish events with topics and metadata)                                  |

### External

| Package              | Role                                         |
| -------------------- | -------------------------------------------- |
| `axios`              | HTTP client for Binance API                  |
| `express`            | Web framework for REST API                   |
| `express-rate-limit` | Rate limiting middleware (HTTP layer)        |
| `helmet`             | Security HTTP headers                        |
| `node-cron`          | Cron scheduling for data collection          |
| `mysql2`             | MySQL database driver                        |
| `ts-sql-query`       | Type-safe SQL query builder                  |
| `p-limit`            | Promise concurrency limiter                  |
| `zod`                | Schema validation (env vars, request params) |
| `uuid`               | UUID generation for message tracking         |

## Configuration

All configuration is validated at startup via Zod schemas from `@trading-model/common`. The service requires:

- **mTLS via SPIRE** — all inter-service communication uses mutual TLS, automatic via SPIRE SVIDs (ADR-0011); no manual certificates
- **MySQL connection** — user, password, host, port, database name
- **Discovery Server URL** — for service registration and heartbeat
- **Cron schedule** — `SCRAPE_INTERVAL` (cron expression, default every minute)
- **Tracked symbols** — `SYMBOLS_TO_TRACK` (JSON array or CSV list)

## Error Handling

- **HTTP layer**: Centralized error handler returns 400 (validation), 404 (not found), 500 (internal)
- **Worker layer**: Each symbol worker is isolated; failures don't block other symbols
- **HTTP client**: Automatic retry with exponential backoff for transient network/server errors
- **Rate limiter**: Blocks until tokens are available (no error — natural pacing)

## Testing Strategy

| Level           | Focus                                                                             | Tools                       |
| --------------- | --------------------------------------------------------------------------------- | --------------------------- |
| **Unit**        | Client functions (URLs, weights), normalizers, workers (mocked API), utils        | Jest, manual mocks          |
| **Integration** | Persistence pipeline (MarketDataController + model), in-memory order book storage | Jest, real in-memory stores |
| **Fixtures**    | Mock Binance API responses for all endpoints                                      | Static fixture files        |
