# Table Schemas — Reference

Full SQL DDL and entity type definitions for MySQL tables used by the financial-scraper service.

> For the architecture-level overview (which database, what for, entity relationships), see [Database Architecture](../architecture/databases.md).

## MySQL — Financial Scraper

All tables live in the `financial_scraper` database (configurable via `DB_NAME` env var).

### `market_candles` — OHLCV candle data

| Column | Type | Constraints | Description |
| ------ | ---- | ----------- | ----------- |
| `id` | `INT` | `AUTO_INCREMENT`, `PK` | Surrogate key |
| `symbol` | `VARCHAR(32)` | `NOT NULL`, `PK` | Trading pair / ticker (e.g. `BTCUSDT`) |
| `market` | `VARCHAR(16)` | `NOT NULL`, `PK` | Market type (`crypto`, `equity`, `bond`, `etf`, `fx`, `future`) |
| `source` | `VARCHAR(32)` | `NOT NULL`, `PK` | Data provider (`binance`, `nyse`, `bloomberg`) |
| `interval_value` | `VARCHAR(16)` | `NOT NULL`, `PK` | Candle interval (e.g. `1m`, `1h`, `1d`) |
| `open` | `DECIMAL(20,10)` | `NOT NULL` | Open price |
| `high` | `DECIMAL(20,10)` | `NOT NULL` | High price |
| `low` | `DECIMAL(20,10)` | `NOT NULL` | Low price |
| `close` | `DECIMAL(20,10)` | `NOT NULL` | Close price |
| `volume` | `DECIMAL(30,10)` | `NOT NULL` | Volume |
| `trades` | `INT` | `NULL` | Number of trades in the interval |
| `timestamp` | `DATETIME(3)` | `NOT NULL`, `PK` | Candle open time |
| `close_timestamp` | `DATETIME(3)` | `NOT NULL` | Candle close time |

**Primary key:** `(symbol, market, interval_value, timestamp, source)`, the business key the upserts (`INSERT ... ON DUPLICATE KEY UPDATE`) rely on; `id` keeps its own index (`idx_candles_id`). Migration 004 replaced the original `(id, ...)` key, which let every scrape insert the same candles again (the DDL below is the baseline 0000 migration).

```sql
CREATE TABLE IF NOT EXISTS `market_candles` (
    `id`               INT NOT NULL AUTO_INCREMENT,
    `symbol`           VARCHAR(32) NOT NULL,
    `market`           VARCHAR(16) NOT NULL,
    `source`           VARCHAR(32) NOT NULL,
    `interval_value`   VARCHAR(16) NOT NULL,
    `open`             DECIMAL(20,10) NOT NULL,
    `high`             DECIMAL(20,10) NOT NULL,
    `low`              DECIMAL(20,10) NOT NULL,
    `close`            DECIMAL(20,10) NOT NULL,
    `volume`           DECIMAL(30,10) NOT NULL,
    `trades`           INT NULL,
    `timestamp`        DATETIME(3) NOT NULL,
    `close_timestamp`  DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`, `symbol`, `market`, `interval_value`, `timestamp`, `source`),
    INDEX `idx_candles_timestamp` (`timestamp` ASC) INVISIBLE,
    INDEX `idx_candles_symbol` (`symbol` ASC) VISIBLE
) ENGINE = InnoDB;
```

**TS entity interface** (`@trading-model/contracts` — `contracts/market-data.types`, re-exporting `contracts/market-data/candle.types`):

```ts
interface CandleData extends BaseMarketData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades?: number;
  interval: string;
  closeTimestamp: number;
}
```

### `market_trades` — Individual trade data

| Column | Type | Constraints | Description |
| ------ | ---- | ----------- | ----------- |
| `id` | `INT` | `AUTO_INCREMENT` | Surrogate key |
| `symbol` | `VARCHAR(32)` | `NOT NULL`, `PK` | Trading pair / ticker |
| `market` | `VARCHAR(16)` | `NOT NULL`, `PK` | Market type |
| `source` | `VARCHAR(32)` | `NOT NULL`, `PK` | Data provider |
| `trade_id` | `BIGINT` | `NOT NULL`, `PK` | Exchange-assigned trade ID |
| `price` | `DECIMAL(20,10)` | `NOT NULL` | Execution price |
| `quantity` | `DECIMAL(30,10)` | `NOT NULL` | Executed quantity |
| `side` | `ENUM('buy','sell')` | `NOT NULL` | Trade direction |
| `timestamp` | `DATETIME(3)` | `NOT NULL`, `PK` | Trade timestamp |

**Composite PK:** `(symbol, market, source, trade_id, timestamp)`

```sql
CREATE TABLE `market_trades` (
    `id`          INT NOT NULL AUTO_INCREMENT,
    `symbol`      VARCHAR(32) NOT NULL,
    `market`      VARCHAR(16) NOT NULL,
    `source`      VARCHAR(32) NOT NULL,
    `trade_id`    BIGINT NOT NULL,
    `price`       DECIMAL(20,10) NOT NULL,
    `quantity`    DECIMAL(30,10) NOT NULL,
    `side`        ENUM('buy', 'sell') NOT NULL,
    `timestamp`   DATETIME(3) NOT NULL,
    PRIMARY KEY (`symbol`, `market`, `source`, `trade_id`, `timestamp`),
    INDEX `idx_trades_timestamp` (`timestamp` ASC) INVISIBLE,
    INDEX `idx_trades_symbol` (`symbol` ASC) VISIBLE
) ENGINE=InnoDB;
```

**TS entity interface** (`@trading-model/contracts` — `contracts/market-data.types`, re-exporting `contracts/market-data/trade.types`):

```ts
interface TradeData extends BaseMarketData {
  price: number;
  tradeId: bigint;
  quantity: number;
  side: 'buy' | 'sell';
}
```

### `market_tickers` — 24-hour ticker statistics

| Column | Type | Constraints | Description |
| ------ | ---- | ----------- | ----------- |
| `id` | `INT` | `AUTO_INCREMENT`, `PK` | Surrogate key |
| `symbol` | `VARCHAR(32)` | `NOT NULL` | Trading pair / ticker |
| `market` | `VARCHAR(16)` | `NOT NULL` | Market type |
| `source` | `VARCHAR(32)` | `NOT NULL` | Data provider |
| `open` | `DECIMAL(20,10)` | `NOT NULL` | Open price in 24h window |
| `high` | `DECIMAL(20,10)` | `NOT NULL` | High price in 24h window |
| `low` | `DECIMAL(20,10)` | `NOT NULL` | Low price in 24h window |
| `last` | `DECIMAL(20,10)` | `NOT NULL` | Last price |
| `volume` | `DECIMAL(30,10)` | `NOT NULL` | Volume in 24h window |
| `timestamp` | `DATETIME(3)` | `NOT NULL` | Snapshot timestamp |
| `close_time` | `DATETIME(3)` | `NOT NULL` | 24h window close time |

**Primary key:** `(symbol, market, timestamp, source)` since migration 004 (was `(id, ...)`, see `market_candles`); `id` keeps `idx_tickers_id`. The DDL below is the baseline 0000 migration.

```sql
CREATE TABLE IF NOT EXISTS `market_tickers` (
    `id`               INT NOT NULL AUTO_INCREMENT,
    `symbol`           VARCHAR(32) NOT NULL,
    `market`           VARCHAR(16) NOT NULL,
    `source`           VARCHAR(32) NOT NULL,
    `open`             DECIMAL(20,10) NOT NULL,
    `high`             DECIMAL(20,10) NOT NULL,
    `low`              DECIMAL(20,10) NOT NULL,
    `last`             DECIMAL(20,10) NOT NULL,
    `volume`           DECIMAL(30,10) NOT NULL,
    `timestamp`        DATETIME(3) NOT NULL,
    `close_time`       DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`, `symbol`, `market`, `timestamp`, `source`),
    INDEX `idx_tickers_timestamp` (`timestamp` ASC) INVISIBLE,
    INDEX `idx_tickers_symbol` (`symbol` ASC) VISIBLE
) ENGINE = InnoDB;
```

**TS entity interface** (`@trading-model/contracts` — `contracts/market-data.types`, re-exporting `contracts/market-data/ticker.types`):

```ts
interface TickerData extends BaseMarketData {
  low: number;
  open: number;
  high: number;
  last: number;
  volume: number;
  closeTimestamp: number;
}
```

### `market_publish_cursors` — how far each candle series is published

Migration 005. The scraper persists candles before publishing them; the candles of a series opened at or after `published_until` are persisted but not yet on the bus. Each cycle publishes the next 100 of them from `market_candles` and moves the cursor once message-manager took them, so a bus outage or a scraper restart loses none.

| Column | Type | Constraints | Description |
| ------ | ---- | ----------- | ----------- |
| `source` | `VARCHAR(32)` | `NOT NULL`, `PK` | Data provider |
| `symbol` | `VARCHAR(32)` | `NOT NULL`, `PK` | Trading pair / ticker |
| `interval_value` | `VARCHAR(16)` | `NOT NULL`, `PK` | Candle interval |
| `market` | `VARCHAR(16)` | `NOT NULL` | Market type of the series |
| `published_until` | `DATETIME(3)` | `NOT NULL` | Open time of the next candle to publish |
| `updated_at` | `DATETIME(3)` | `NOT NULL`, auto | Last move |

**Primary key:** `(source, symbol, interval_value)`. A series without a row starts at the first candle the scraper persists, not at the history. Skipping a backlog on purpose: see `runbook-message-bus-outage`.

### `market_order_books` — order book depth snapshots

Migration 008, ADR-0053. One row per depth snapshot the collector fetched (100 bids + 100 asks per symbol, once a minute), kept for historical replay. No API route reads it; the trainer gets order books on the bus. Purged by `db-retention` on `timestamp` after `RETENTION_DAYS` (ADR-0051).

| Column | Type | Constraints | Description |
| ------ | ---- | ----------- | ----------- |
| `symbol` | `VARCHAR(32)` | `NOT NULL`, `PK` | Trading pair / ticker |
| `market` | `VARCHAR(16)` | `NOT NULL`, `PK` | Market type |
| `source` | `VARCHAR(32)` | `NOT NULL`, `PK` | Data provider |
| `timestamp` | `DATETIME(3)` | `NOT NULL`, `PK` | When the scraper took the snapshot |
| `bids` | `JSON` | `NOT NULL` | `[price, quantity]` pairs, best (highest) first |
| `asks` | `JSON` | `NOT NULL` | `[price, quantity]` pairs, best (lowest) first |

**Primary key:** `(symbol, market, source, timestamp)`: a replayed snapshot overwrites its row. **Index:** `idx_order_books_timestamp` (visible), used by the retention job.

### `signals` — signals of every dimension

Migration 006, ADR-0036. One observation about an asset or a whole sector, collected from the source registry (`services/financial-scraper/src/config/signal-registry.json`): the signal envelope in columns, its canonical payload in JSON.

| Column | Type | Constraints | Description |
| ------ | ---- | ----------- | ----------- |
| `id` | `CHAR(64)` | `NOT NULL`, `PK` | sha256 of source, subject, metric and observation key: a replayed collection inserts nothing (`ON DUPLICATE KEY UPDATE id = id`) |
| `schema_version` | `SMALLINT UNSIGNED` | `NOT NULL` | `SIGNAL_SCHEMA_VERSION` the row was written with |
| `source_id` | `VARCHAR(64)` | `NOT NULL` | Registry source |
| `dimension` | `VARCHAR(32)` | `NOT NULL` | `market`, `fundamental`, `social`, `contextual`, `legal`, `macro` |
| `asset_id` | `VARCHAR(32)` | `NULL` | Asset of the signal; null for a sector signal |
| `sector` | `VARCHAR(32)` | `NULL` | Sector of a sector signal (e.g. weather for `agriculture`); null for an asset signal |
| `observed_at` | `DATETIME(3)` | `NOT NULL` | Never earlier than the value was public (point in time): the source's time when safe, else the first collection that saw it |
| `ingested_at` | `DATETIME(3)` | `NOT NULL` | When the scraper fetched it |
| `confidence_score` | `DOUBLE` | `NOT NULL` | Source reliability at collection time, 0–1 |
| `payload` | `JSON` | `NOT NULL` | Canonical payload of the dimension (`PAYLOADS`): `metric` (e.g. `spot_rate_10y`, `us-gaap:EarningsPerShareDiluted`), `value`, `unit`, optional `details`, plus `period`, `filing`, `platform`/`topic`, `location`, `jurisdiction` or `area` depending on the dimension |

**Constraint:** `chk_signals_one_subject`, exactly one of `asset_id` and `sector`. **Indexes:** `(asset_id, observed_at)` and `(sector, observed_at)`, the two halves of `GET /signals/assets/:assetId`.

### Shared base interface

```ts
interface BaseMarketData {
  symbol: string;
  source: SourceType; // 'binance' | 'nyse' | 'bloomberg'
  timestamp: number;
  market: MarketType; // 'crypto' | 'equity' | 'bond' | 'etf' | 'fx' | 'future'
}
```

## Index Conventions

- All tables have an `INVISIBLE` index on `timestamp` — tracked by the optimizer but not used unless explicitly hinted
- All tables have a `VISIBLE` index on `symbol` — the primary query path for market data lookups

## Entity Types Not Yet Persisted

This interface exists in `@trading-model/contracts` (`contracts/market-data/orderbook.types`) but has **no corresponding table** yet:

- `BookTickerData` — best bid/ask ticker (`bid`, `ask`, `bidQty`, `askQty`)
