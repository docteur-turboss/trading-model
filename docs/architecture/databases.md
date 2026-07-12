# Database Architecture

The project uses two database engines managed by different services.

## MySQL — Financial Scraper

Used by `financial-scraper` to persist market data. All tables live in the `financial_scraper` database. The ORM is [`ts-sql-query`](https://github.com/vernic/ts-sql-query) with a custom `DBConnection` wrapper.

| Table | Stores | Key fields |
| ----- | ------ | ---------- |
| `market_candles` | OHLCV candle data | symbol, market, source, interval, open/high/low/close, volume, timestamp |
| `market_trades` | Individual trade data | symbol, trade_id, price, quantity, side, timestamp |
| `market_tickers` | 24-hour ticker statistics | symbol, open/high/low/last, volume, timestamp |

Full DDL, column specs, and TypeScript interfaces: [Table Schemas Reference](../reference/table-schemas.md).

## MongoDB — Message Manager and Audit

MongoDB 7 is used by several services via the native `mongodb` driver (no Mongoose):

| Service | Stores |
| ------- | ------ |
| **message-manager** | Message archival data |
| **certificate-authority** | Certificates, CRL, CA metadata, tokens, nonces, distributed locks |
| **audit-logger** | Audit event persistence |
| **dlq-service** | Dead letter entries |

## Schema Validation

The message broker uses **Zod validation schemas** at `services/message-manager/src/messaging/transport/validation/broker.schema.ts` to enforce message shapes, subscriptions, and metadata.
