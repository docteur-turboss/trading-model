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

Three tables store market data:

| Table              | Content                   |
| ------------------ | ------------------------- |
| `market_candles`   | OHLCV candle data         |
| `market_trades`    | Individual trade data     |
| `market_tickers`   | 24-hour ticker statistics |

See [`docs/architecture/databases.md`](../architecture/databases.md#mysql--financial-scraper-financial-scraper) for the full column definitions, SQL DDL, composite primary keys, index conventions, and TypeScript interfaces.

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
