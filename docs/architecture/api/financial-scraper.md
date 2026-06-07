# financial-scraper — Financial Data Collector

Market data collection service from Binance, with MySQL persistence and REST API exposure.

## General Information

| Property         | Value                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Service name     | `financial-scraper-service`                                                                                   |
| Port (host)      | `8445`                                                                                                         |
| Port (container) | `3000`                                                                                                         |
| Dependencies     | `@trading-model/common`, `@trading-model/address-manager`, `@trading-model/broker-message`, MySQL, Binance API |

## REST Endpoints

All endpoints are **GET** and return the requested financial data.

### Trades

| Route                         | Parameter               | Example                       |
| ----------------------------- | ----------------------- | ----------------------------- |
| `/trade/sources/:source`      | Source (e.g. `binance`) | `/trade/sources/binance`      |
| `/trade/symbols/:symbol`      | Symbol (e.g. `BTCUSDT`) | `/trade/symbols/BTCUSDT`      |
| `/trade/timestamp/:timestamp` | Unix timestamp          | `/trade/timestamp/1705315200` |

**Response:**

```json
{
  "data": [
    {
      "symbol": "BTCUSDT",
      "market": "crypto",
      "source": "binance",
      "tradeId": 123456789,
      "price": 50000.0,
      "quantity": 0.5,
      "side": "buy",
      "timestamp": 1705315200000
    }
  ]
}
```

### Tickers

| Route                          | Parameter      |
| ------------------------------ | -------------- |
| `/ticker/sources/:source`      | Source         |
| `/ticker/symbols/:symbol`      | Symbol         |
| `/ticker/timestamp/:timestamp` | Unix timestamp |

**Response:**

```json
{
  "data": [
    {
      "symbol": "BTCUSDT",
      "market": "crypto",
      "source": "binance",
      "open": 49000.0,
      "high": 51000.0,
      "low": 48500.0,
      "last": 50000.0,
      "volume": 12500.5,
      "closeTimestamp": 1705315200000
    }
  ]
}
```

### Candles (OHLCV)

| Route                           | Parameter      |
| ------------------------------- | -------------- |
| `/candles/sources/:source`      | Source         |
| `/candles/symbols/:symbol`      | Symbol         |
| `/candles/timestamp/:timestamp` | Unix timestamp |

**Response:**

```json
{
  "data": [
    {
      "symbol": "BTCUSDT",
      "market": "crypto",
      "source": "binance",
      "interval": "1h",
      "open": 50000.0,
      "high": 50100.0,
      "low": 49900.0,
      "close": 50050.0,
      "volume": 1250.5,
      "trades": 342,
      "timestamp": 1705315200000,
      "closeTimestamp": 1705318800000
    }
  ]
}
```

### Order Book

| Route                                   | Parameter         |
| --------------------------------------- | ----------------- |
| `/orderbook/sources/:source`            | Source            |
| `/orderbook/symbols/:symbol`            | Symbol            |
| `/orderbook/after/timestamp/:timestamp` | Timestamp (after) |

**Response:**

```json
{
  "data": {
    "symbol": "BTCUSDT",
    "source": "binance",
    "timestamp": 1705315200000,
    "bids": [
      ["50000.00", "1.5"],
      ["49990.00", "2.3"]
    ],
    "asks": [
      ["50010.00", "0.8"],
      ["50020.00", "1.1"]
    ]
  }
}
```

### Heartbeat

| Route                                    | Parameter          |
| ---------------------------------------- | ------------------ |
| `/heartbeat/before/timestamp/:timestamp` | Timestamp (before) |

## MySQL Tables

All tables live in the `financial_scraper` database (configurable via `DB_NAME` env var). The ORM is `ts-sql-query` with a custom `DBConnection` wrapper.

### `market_candles` — OHLCV candle data

| Column            | Type             | Constraints            | Description                        |
| ----------------- | ---------------- | ---------------------- | ---------------------------------- |
| `id`              | `INT`            | `AUTO_INCREMENT`, `PK` | Surrogate key                      |
| `symbol`          | `VARCHAR(32)`    | `NOT NULL`, `PK`       | Trading pair (e.g. `BTCUSDT`)      |
| `market`          | `VARCHAR(16)`    | `NOT NULL`, `PK`       | Market type                        |
| `source`          | `VARCHAR(32)`    | `NOT NULL`, `PK`       | Data provider                      |
| `interval_value`  | `VARCHAR(16)`    | `NOT NULL`, `PK`       | Candle interval (`1m`, `1h`, `1d`) |
| `open`            | `DECIMAL(20,10)` | `NOT NULL`             | Open price                         |
| `high`            | `DECIMAL(20,10)` | `NOT NULL`             | High price                         |
| `low`             | `DECIMAL(20,10)` | `NOT NULL`             | Low price                          |
| `close`           | `DECIMAL(20,10)` | `NOT NULL`             | Close price                        |
| `volume`          | `DECIMAL(30,10)` | `NOT NULL`             | Volume                             |
| `trades`          | `INT`            | `NULL`                 | Trade count in interval            |
| `timestamp`       | `DATETIME(3)`    | `NOT NULL`, `PK`       | Candle open time                   |
| `close_timestamp` | `DATETIME(3)`    | `NOT NULL`             | Candle close time                  |

**Composite PK:** `(id, symbol, market, interval_value, timestamp, source)`

### `market_trades` — Individual trade data

| Column      | Type                 | Constraints      | Description                |
| ----------- | -------------------- | ---------------- | -------------------------- |
| `id`        | `INT`                | `AUTO_INCREMENT` | Surrogate key              |
| `symbol`    | `VARCHAR(32)`        | `NOT NULL`, `PK` | Trading pair               |
| `market`    | `VARCHAR(16)`        | `NOT NULL`, `PK` | Market type                |
| `source`    | `VARCHAR(32)`        | `NOT NULL`, `PK` | Data provider              |
| `trade_id`  | `BIGINT`             | `NOT NULL`, `PK` | Exchange-assigned trade ID |
| `price`     | `DECIMAL(20,10)`     | `NOT NULL`       | Execution price            |
| `quantity`  | `DECIMAL(30,10)`     | `NOT NULL`       | Executed quantity          |
| `side`      | `ENUM('buy','sell')` | `NOT NULL`       | Trade direction            |
| `timestamp` | `DATETIME(3)`        | `NOT NULL`, `PK` | Trade timestamp            |

**Composite PK:** `(symbol, market, source, trade_id, timestamp)`

### `market_tickers` — 24-hour ticker statistics

| Column       | Type             | Constraints            | Description              |
| ------------ | ---------------- | ---------------------- | ------------------------ |
| `id`         | `INT`            | `AUTO_INCREMENT`, `PK` | Surrogate key            |
| `symbol`     | `VARCHAR(32)`    | `NOT NULL`             | Trading pair             |
| `market`     | `VARCHAR(16)`    | `NOT NULL`             | Market type              |
| `source`     | `VARCHAR(32)`    | `NOT NULL`             | Data provider            |
| `open`       | `DECIMAL(20,10)` | `NOT NULL`             | Open price in 24h window |
| `high`       | `DECIMAL(20,10)` | `NOT NULL`             | High price in 24h window |
| `low`        | `DECIMAL(20,10)` | `NOT NULL`             | Low price in 24h window  |
| `last`       | `DECIMAL(20,10)` | `NOT NULL`             | Last price               |
| `volume`     | `DECIMAL(30,10)` | `NOT NULL`             | Volume in 24h window     |
| `timestamp`  | `DATETIME(3)`    | `NOT NULL`             | Snapshot timestamp       |
| `close_time` | `DATETIME(3)`    | `NOT NULL`             | 24h window close time    |

**Composite PK:** `(id, symbol, market, timestamp, source)`

### Index Conventions

- All tables have an `INVISIBLE` index on `timestamp` — tracked by the optimizer but not used unless explicitly hinted.
- All tables have a `VISIBLE` index on `symbol` — the primary query path for market data lookups.

### TS Entity Interfaces (`@trading-model/common`)

```ts
interface BaseMarketEntity {
  symbol: string;
  source: SourceType; // 'binance' | 'nyse' | 'bloomberg'
  timestamp: number;
  market: MarketType; // 'crypto' | 'equity' | 'bond' | 'etf' | 'fx' | 'future'
}

interface CandleEntity extends BaseMarketEntity {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades?: number;
  interval: string;
  closeTimestamp: number;
}

interface TradeEntity extends BaseMarketEntity {
  price: number;
  tradeId: bigint;
  quantity: number;
  side: 'buy' | 'sell';
}

interface TickerEntity extends BaseMarketEntity {
  low: number;
  open: number;
  high: number;
  last: number;
  volume: number;
  closeTimestamp: number;
}
```

Interfaces that exist but have **no corresponding table** yet: `OrderBookEntity` (order book depth), `BookTickerEntity` (best bid/ask).

## Background Jobs (Scheduled Tasks)

**BinanceWorker** instances are created per symbol via `node-cron` to periodically fetch 6 data types:

1. **Candlesticks** (OHLCV candles)
2. **Recent Trades** (recent trades)
3. **Order Book Snapshot** (order book depth)
4. **Order Book Ticker** (best bid/ask)
5. **24hr Ticker Stats** (24h statistics)
6. **Price Ticker** (current price)

- `node-cron` orchestrates per-symbol workers with concurrency control via `p-limit`
- Each worker fetches all 6 data types in parallel, normalizes responses, and publishes events to the message bus

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
  └── BinanceWorker (per symbol)
        ├── Binance API fetch
        ├── Token Bucket (rate limiting)
        └── MySQL write + Bus publication

Dependencies
  ├── MySQL (persistence)
  ├── discovery-server (registration)
  └── message-manager (event publication)
```
