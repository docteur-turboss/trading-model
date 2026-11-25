# Financial Scraper — Architecture

Routes, tables, scheduling, rate limiting, signals and environment: [docs/services/financial-scraper.md](../../docs/services/financial-scraper.md). This file holds the internal data flow and the module breakdown.

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
WorkerOrchestrator ─── fetch → persist, per symbol (under ScrapeCronOrchestrator + p-limit)
     │
     ▼
MarketDataPersister.persist()
     │
     ├── insertCandles()   → MySQL (market_candles)
     ├── insertOrderBook() → MySQL (market_order_books)
     └── insertTicker()    → MySQL (market_tickers)
```

## Components

### HTTP client (`src/config/http.ts`)

`createHttpClient` builds an Axios instance with a per-baseURL token bucket (the `weight` of each request config is the cost, mirroring Binance's API weights) and exponential backoff retry. Retry rules and the 418/451 quarantine: ADR-0026. `AxiosRequestConfig` gets `weight?: number` by declaration merging (`src/infrastructure/http/axios.d.ts`).

### Binance client (`src/adapters/outbound/binance/`)

| Module              | Responsibility                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoints.ts`      | Pure functions that construct Binance REST API URLs                                                                                                              |
| `weights.ts`        | Pure functions that compute Binance API weight costs for each endpoint                                                                                           |
| `binance.client.ts` | Async functions (`getOrderBook`, `getCandlestickData`, etc.) each calling the Axios instance with the correct weight                          |
| `normalizer.ts`     | `BinanceNormalizer` (static methods) converting raw API shapes to internal entity types (`OrderBookEntity`, `CandleEntity`, `TickerEntity`)       |

### Scrape cycle (`src/adapters/inbound/cron/`, `src/application/worker-orchestrator.ts`, `src/domain/ports/`)

| Component                   | File                                                      | Role                                                                    |
| --------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `MarketDataSourcePort`      | `domain/ports/market-data-source.port.ts`                 | A market data provider: `fetchSnapshot(request)` returns a `MarketDataSnapshot` |
| `BinanceMarketDataSource`   | `adapters/outbound/binance/binance-market-data-source.ts` | The only source today (ADR-0026)                                        |
| `WorkerOrchestrator`        | `application/worker-orchestrator.ts`                      | Per symbol: fetch → persist; resumes the fetch at the newest stored candle |
| `ScrapeCronOrchestrator`    | `adapters/inbound/cron/scrape.cron.ts`                    | Runs the cycle on a cron expression, prevents overlapping runs          |

Adding a source means an adapter implementing `MarketDataSourcePort` and a value of `DataSource`; the cycle does not change.

### Persistence (`src/adapters/outbound/persistence/`)

Schemas live in `schema/` (`candles`, `ticker24h`, `order-book`); market data types in `src/domain/market-data.types.ts`. `createMarketDataPersister()` (`src/application/persist-market-data.ts`) depends on `MarketDataRepositoryPort` (`src/domain/ports/`); `src/config/container.ts` wires it to the schema insert functions and builds the scrape-cycle dependencies of `WorkerOrchestrator`. Columns: [databases.md](../../docs/architecture/databases.md#mysql--financial-scraper).

### Signals (ADR-0036)

| Component | Location | Responsibility |
| --- | --- | --- |
| Schema v1 | `domain/signals.ts` | `Asset`, `Dimension`, `Source`, `Signal` (Zod), `SIGNAL_SCHEMA_VERSION` |
| Source registry | `config/signal-registry.json`, `config/signal-registry.ts` | Assets and sources, checked at startup (`parseSignalRegistry`) |
| `SignalCronScheduler` | `adapters/inbound/cron/signal.cron.ts` | One cron task per source, overlapping ticks skipped |
| `SignalCollector` | `application/signal-collector.ts` | Per request: worker → adapter → schema check → store |
| `rest_api` worker | `adapters/outbound/signal-sources/rest-api.worker.ts` | GET, JSON, 10 s timeout |
| Source adapters | `adapters/outbound/signal-sources/` (`SOURCE_ADAPTERS`) | One per source format |
| `MySqlSignalStore` | `adapters/outbound/persistence/signal-store.ts` | Table `signals`: idempotent insert, asset + sector window query |

## Testing Strategy

| Level           | Focus                                                                      | Tools                   |
| --------------- | -------------------------------------------------------------------------- | ----------------------- |
| **Unit**        | Client functions (URLs, weights), normalizers, workers (mocked API), utils | Jest, manual mocks      |
| **Integration** | Persistence pipeline (MarketDataPersister + model)                         | Jest, mocked repository |
| **Fixtures**    | Mock Binance API responses for all endpoints                               | Static fixture files    |
