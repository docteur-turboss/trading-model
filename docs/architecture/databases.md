# Database Architecture

The project uses two database engines managed by different services.

## MySQL — Financial Scraper

Used by `financial-scraper` to persist market data. All tables live in the `financial_scraper` database. The ORM is [`ts-sql-query`](https://github.com/vernic/ts-sql-query) with a custom `DBConnection` wrapper.

| Table | Stores | Key fields |
| ----- | ------ | ---------- |
| `market_candles` | OHLCV candle data | symbol, market, source, interval, open/high/low/close, volume, timestamp |
| `market_trades` | Individual trade data | symbol, trade_id, price, quantity, side, timestamp |
| `market_tickers` | 24-hour ticker statistics | symbol, open/high/low/last, volume, timestamp |
| `market_publish_cursors` | Per candle series, open time of the next candle to publish to the bus (the persisted candles from it wait for message-manager) | source, symbol, interval, market, published_until |
| `signals` | Signals of every dimension from the source registry (ADR-0036): one observation of one metric about an asset or a sector | id, source_id, dimension, asset_id / sector, metric, value, unit, observed_at, confidence_score, attributes (JSON) |

Full DDL, column specs, and TypeScript interfaces: [Table Schemas Reference](../reference/table-schemas.md).

## MongoDB — Message Manager and Audit

MongoDB 7 is used by several services via the native `mongodb` driver (no Mongoose):

| Service | Stores |
| ------- | ------ |
| **message-manager** | Message archival data |
| **audit-logger** | Audit event persistence |
| **dlq-service** | Dead letter entries |

> SPIRE Server (ADR-0011) uses MySQL for its datastore (`spire` database).

## Schema Validation

The message broker uses **Zod validation schemas** at `services/message-manager/src/adapters/inbound/validation/broker.schema.ts` to enforce message shapes, subscriptions, and metadata.
