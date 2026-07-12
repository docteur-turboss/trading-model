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

**Composite PK:** `(id, symbol, market, interval_value, timestamp, source)`

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

**TS entity interface** (`@trading-model/common`):

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

**TS entity interface** (`@trading-model/common`):

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

**Composite PK:** `(id, symbol, market, timestamp, source)`

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

**TS entity interface** (`@trading-model/common`):

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

These interfaces exist in `@trading-model/common` but have **no corresponding table** yet:

- `OrderBookData` — order book depth snapshots (`bids` / `asks`)
- `BookTickerData` — best bid/ask ticker (`bid`, `ask`, `bidQty`, `askQty`)
