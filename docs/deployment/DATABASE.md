# Database

The project uses two database engines managed by the **Financial Scraper** (MySQL) and **Message Manager** (MongoDB) services.

---

## MySQL — Financial Scraper

**Image:** `mysql:8`

**Container:** `trading-mysql`

**Database:** `financial_scraper` (configurable via `DB_NAME` env var)

**ORM:** `ts-sql-query` with a custom `DBConnection` wrapper.

### Tables

Defined in `scripts/init-db.sql`, mounted in `/docker-entrypoint-initdb.d/`:

#### `market_candles` — OHLCV candle data

| Column            | Type             | Constraints            | Description                                                     |
| ----------------- | ---------------- | ---------------------- | --------------------------------------------------------------- |
| `id`              | `INT`            | `AUTO_INCREMENT`, `PK` | Surrogate key                                                   |
| `symbol`          | `VARCHAR(32)`    | `NOT NULL`, `PK`       | Trading pair / ticker (e.g. `BTCUSDT`)                          |
| `market`          | `VARCHAR(16)`    | `NOT NULL`, `PK`       | Market type (`crypto`, `equity`, `bond`, `etf`, `fx`, `future`) |
| `source`          | `VARCHAR(32)`    | `NOT NULL`, `PK`       | Data provider (`binance`, `nyse`, `bloomberg`)                  |
| `interval_value`  | `VARCHAR(16)`    | `NOT NULL`, `PK`       | Candle interval (e.g. `1m`, `1h`, `1d`)                         |
| `open`            | `DECIMAL(20,10)` | `NOT NULL`             | Open price                                                      |
| `high`            | `DECIMAL(20,10)` | `NOT NULL`             | High price                                                      |
| `low`             | `DECIMAL(20,10)` | `NOT NULL`             | Low price                                                       |
| `close`           | `DECIMAL(20,10)` | `NOT NULL`             | Close price                                                     |
| `volume`          | `DECIMAL(30,10)` | `NOT NULL`             | Volume                                                          |
| `trades`          | `INT`            | `NULL`                 | Number of trades in the interval                                |
| `timestamp`       | `DATETIME(3)`    | `NOT NULL`, `PK`       | Candle open time                                                |
| `close_timestamp` | `DATETIME(3)`    | `NOT NULL`             | Candle close time                                               |

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

**TS entity interface** (`@trading-model/common` — `packages/common/src/config/event.types.ts`):

```ts
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
```

#### `market_trades` — Individual trade data

| Column      | Type                 | Constraints      | Description                |
| ----------- | -------------------- | ---------------- | -------------------------- |
| `id`        | `INT`                | `AUTO_INCREMENT` | Surrogate key              |
| `symbol`    | `VARCHAR(32)`        | `NOT NULL`, `PK` | Trading pair / ticker      |
| `market`    | `VARCHAR(16)`        | `NOT NULL`, `PK` | Market type                |
| `source`    | `VARCHAR(32)`        | `NOT NULL`, `PK` | Data provider              |
| `trade_id`  | `BIGINT`             | `NOT NULL`, `PK` | Exchange-assigned trade ID |
| `price`     | `DECIMAL(20,10)`     | `NOT NULL`       | Execution price            |
| `quantity`  | `DECIMAL(30,10)`     | `NOT NULL`       | Executed quantity          |
| `side`      | `ENUM('buy','sell')` | `NOT NULL`       | Trade direction            |
| `timestamp` | `DATETIME(3)`        | `NOT NULL`, `PK` | Trade timestamp            |

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
interface TradeEntity extends BaseMarketEntity {
  price: number;
  tradeId: bigint;
  quantity: number;
  side: 'buy' | 'sell';
}
```

#### `market_tickers` — 24-hour ticker statistics

| Column       | Type             | Constraints            | Description              |
| ------------ | ---------------- | ---------------------- | ------------------------ |
| `id`         | `INT`            | `AUTO_INCREMENT`, `PK` | Surrogate key            |
| `symbol`     | `VARCHAR(32)`    | `NOT NULL`             | Trading pair / ticker    |
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
interface TickerEntity extends BaseMarketEntity {
  low: number;
  open: number;
  high: number;
  last: number;
  volume: number;
  closeTimestamp: number;
}
```

#### Shared base interface (`BaseMarketEntity`)

All market entities extend:

```ts
interface BaseMarketEntity {
  symbol: string;
  source: SourceType; // 'binance' | 'nyse' | 'bloomberg'
  timestamp: number;
  market: MarketType; // 'crypto' | 'equity' | 'bond' | 'etf' | 'fx' | 'future'
}
```

#### Entity types not yet persisted

These interfaces exist in `@trading-model/common` but have **no corresponding table** yet:

- `OrderBookEntity` — order book depth snapshots (`bids` / `asks`)
- `BookTickerEntity` — best bid/ask ticker (`bid`, `ask`, `bidQty`, `askQty`)

#### Index conventions

- All tables have an `INVISIBLE` index on `timestamp` — tracked by the optimizer but not used unless explicitly hinted
- All tables have a `VISIBLE` index on `symbol` — the primary query path for market data lookups

### Persistent volume

```yaml
volumes:
  - mysql-data:/var/lib/mysql
```

### Environment variables

| Variable      | Default             | Description                      |
| ------------- | ------------------- | -------------------------------- |
| `DB_USER`     | `root`              | MySQL user                       |
| `DB_PASSWORD` | `changeme`          | MySQL password                   |
| `DB_NAME`     | `financial_scraper` | Database name                    |
| `DB_HOST`     | `mysql`             | MySQL host (Docker service name) |
| `DB_PORT`     | `3306`              | MySQL port                       |

Defined in `docker-compose.yml` via `.env` variables:

```yaml
environment:
  DB_USER: ${MYSQL_USER:-root}
  DB_PASSWORD: ${MYSQL_ROOT_PASSWORD:-changeme}
  DB_NAME: ${MYSQL_DATABASE:-financial_scraper}
  DB_HOST: mysql
  DB_PORT: '3306'
```

### Initialization

The file `scripts/init-db.sql` is mounted in the MySQL container:

```yaml
volumes:
  - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
```

MySQL automatically executes all `.sql` files in this directory on **first startup** (empty database).

---

## MongoDB — Message Manager

**Image:** `mongo:7`

**Container:** `trading-mongo`

**Database:** `message-manager`

**Connection:** `MONGODB_URI=mongodb://mongo:27017/message-manager`

### Persistent volume

```yaml
volumes:
  - mongo-data:/data/db
```

### Schema

Currently, no Mongoose models or MongoDB schemas are defined in the codebase. The message broker operates entirely in-memory with **Zod validation schemas** (`services/message-manager/src/messaging/transport/validation/broker.schema.ts`) that enforce the shape of published messages, subscriptions, and metadata. Persistence to MongoDB is **planned but not yet implemented**.

---

## Schema management (migrations)

No automated migration tool exists yet.

For MySQL schema changes:

1. Add `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` statements to `scripts/init-db.sql`
2. Restart the MySQL container

> ⚠️ Destructive changes (column removal, constraint modification) may require manual intervention in production.

---

## Reset

⚠️ **Permanent data loss**

```bash
docker compose down -v
```

Removes containers **and** `mongo-data` / `mysql-data` volumes. On next `docker compose up -d`, databases are reinitialized via init scripts.
