# financial-scraper — Financial Data Collector

Market data collection service from Binance, with MySQL persistence and REST API exposure.

## General Information

| Property         | Value                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Service name     | `financial-scraper`                                                                                    |
| Port (host)      | `8445`                                                                                                         |
| Port (container) | `3000`                                                                                                         |
| Dependencies     | `@trading-model/common`, `@trading-model/address-manager`, `@trading-model/broker-message`, MySQL, Binance API |

## REST Endpoints

All endpoints are **GET**, return a JSON **array** (possibly empty), and answer
400 with `{ "error": "Validation failed", "details": [...] }` on an invalid
parameter. Their parameters and responses are declared in
`src/adapters/inbound/http/api-routes.ts` (`SCRAPER_API`, ADR-0021) and
published in the [OpenAPI](openapi/api-gateway.yaml); through the gateway they
are reached under the service prefix `financial-scraper` of the gateway API (v1).

| Route                                    | Returns                                           | Parameter                                   |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| `/trade/sources/:source`                 | trades of a source                                | `binance`, `bloomberg` or `nyse`            |
| `/trade/symbols/:symbol`                 | trades of a symbol                                | e.g. `BTCUSDT`                              |
| `/trade/timestamp/:timestamp`            | trades at **exactly** this instant                | ISO date or date-time                       |
| `/ticker/sources/:source`                | 24h tickers of a source                           | source                                      |
| `/ticker/symbols/:symbol`                | 24h tickers of a symbol                           | symbol                                      |
| `/ticker/timestamp/:timestamp`           | 24h tickers opened at **exactly** this instant    | ISO date or date-time                       |
| `/candles/sources/:source`               | candles of a source                               | source                                      |
| `/candles/symbols/:symbol`               | candles of a symbol                               | symbol                                      |
| `/candles/timestamp/:timestamp`          | candles opened **after** this instant             | ISO date or date-time                       |
| `/orderbook/sources/:source`             | order book snapshots of a source                  | source                                      |
| `/orderbook/symbols/:symbol`             | order book snapshots of a symbol                  | symbol                                      |
| `/orderbook/after/timestamp/:timestamp`  | snapshots after this instant                      | epoch milliseconds                          |
| `/orderbook/before/timestamp/:timestamp` | snapshots before this instant                     | epoch milliseconds                          |

Queries are not paginated: a symbol or source query returns every stored row.

Trades, tickers and candles come from MySQL: their instants are ISO date-times
and `tradeId` (BIGINT) is a decimal string, exact past 2^53:

```json
[
  {
    "symbol": "BTCUSDT",
    "market": "crypto",
    "source": "binance",
    "side": "buy",
    "price": 50000.0,
    "quantity": 0.5,
    "tradeId": "9007199254740993",
    "timestamp": "2024-01-15T10:40:00.000Z"
  }
]
```

Tickers carry `open`, `high`, `low`, `last`, `volume`, `timestamp` and
`closeTimestamp`; candles carry `interval`, `open`, `high`, `low`, `close`,
`volume`, `trades` (absent when unknown), `timestamp` and `closeTimestamp`.

Order books are in-memory snapshots (lost on restart), timestamped in epoch
milliseconds:

```json
[
  {
    "symbol": "BTCUSDT",
    "market": "crypto",
    "source": "binance",
    "timestamp": 1705315200000,
    "bids": [{ "price": 50000.0, "quantity": 1.5 }],
    "asks": [{ "price": 50010.0, "quantity": 0.8 }]
  }
]
```

## MySQL Tables

All tables live in the `financial_scraper` database (configurable via `DB_NAME` env var). The ORM is `ts-sql-query` with a custom `DBConnection` wrapper.

Three tables store market data:

| Table              | Content                   |
| ------------------ | ------------------------- |
| `market_candles`   | OHLCV candle data         |
| `market_trades`    | Individual trade data     |
| `market_tickers`   | 24-hour ticker statistics |

See [`docs/architecture/databases.md`](../architecture/databases.md#mysql--financial-scraper-financial-scraper) for the full column definitions, SQL DDL, composite primary keys, index conventions, and TypeScript interfaces.

## Background Jobs (Scheduled Tasks)

A `node-cron` cycle (`ScrapeCronOrchestrator`) asks the market data source (`MarketDataSourcePort`, Binance today: `BinanceMarketDataSource`, ADR-0026) for a snapshot of each symbol, persists it, then publishes it. A snapshot holds 6 data types:

1. **Candlesticks** (OHLCV candles)
2. **Recent Trades** (recent trades)
3. **Order Book Snapshot** (order book depth)
4. **Order Book Ticker** (best bid/ask)
5. **24hr Ticker Stats** (24h statistics)
6. **Price Ticker** (current price)

- `node-cron` runs the cycle with concurrency control via `p-limit`
- The Binance source fetches all 6 data types in parallel and normalizes them; `BrokerMarketDataPublisher` publishes them to the message bus
- Failures stay where they happen: a symbol that fails does not stop the others (`fs_symbols_failed_total`), and an endpoint that fails only leaves its data type out of the snapshot (`fs_snapshot_parts_failed_total{part}`): an order book error does not cost the candles. The symbol fails only when all 6 endpoints fail
- MySQL does not wait for the bus: the cycle persists, then starts the publish without awaiting it (a hung message-manager may hold a publish for `PUBLISH_TIMEOUT_MS`). While a symbol's publish is in flight, the next cycles persist only (`fs_publishes_skipped_total`; their trades, tickers and order book are not published, they are snapshots)
- The candles to publish are read back from MySQL: each series has a publish cursor (`market_publish_cursors`, migration 005, open time of the next candle to publish) that moves only once a publish of its candles succeeded. Each cycle sends the next 100 persisted candles from the cursor, so a bus outage or a collector restart loses none (`fs_unpublished_candles{symbol}` counts those waiting, alert `MarketDataUnpublished`). A series without a cursor starts at the first candle the process persists, not at the history. If the backlog cannot be read (MySQL down) the other data types still go out. On shutdown the scraper stops the cron and waits for the running cycle and the publishes in flight (collector grace period 360 s)
- Candles are fetched from a per-symbol cursor (`startTime` = close of the last persisted candle + 1 ms), so each cycle publishes only the candles closed since the previous one and catches up after an outage. The still-open candle is never published. The cursor lives in memory: after a restart the first cycle sends the latest window again, which the upserts and the trainer absorb

### Rate Limiting

- Algorithm: **Token Bucket** — respects Binance API weight costs per endpoint
- Retry strategy: **exponential backoff** (5 retries, 300ms–10s)
- Prevents Binance API bans

## Architecture

```
HTTP Server
  ├── Financial routes (/trade/*, /ticker/*, /candles/*, /orderbook/*)
  ├── AddressManager routes (ping)
  └── MessageManager routes (callback)

Background
  └── WorkerOrchestrator (per symbol)
        ├── MarketDataSourcePort → Binance public API (token bucket)
        ├── MarketDataPublisherPort → message bus
        └── MySQL write

Dependencies
  ├── MySQL (persistence)
  ├── discovery-server (registration)
  └── message-manager (event publication)
```
