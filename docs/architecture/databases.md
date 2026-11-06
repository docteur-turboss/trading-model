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
| `signals` | Signals of every dimension from the source registry (ADR-0036): one observation about an asset or a sector | id, source_id, dimension, asset_id / sector, observed_at, ingested_at, confidence_score, payload (JSON, canonical per dimension) |

Full DDL, column specs, and TypeScript interfaces: [Table Schemas Reference](../reference/table-schemas.md).

## MongoDB — Message Manager and Audit

MongoDB 7 is used by several services via the native `mongodb` driver (no Mongoose):

| Service | Stores |
| ------- | ------ |
| **message-manager** | Message archival data |
| **audit-logger** | Audit event persistence |
| **dlq-service** | Dead letter entries |

> SPIRE Server (ADR-0011) uses MySQL for its datastore (`spire` database).

## Redis — who uses it, with which keys

Inventory (issue #506). Address-manager caches in memory per process, so only three services still talk to Redis (K8s: through the sentinels). Never `KEYS` (ADR-0023).

| Service | Key prefix | Commands | Purpose |
| ------- | ---------- | -------- | ------- |
| discovery-server | `trading-model:discovery:*` | `GET SET DEL MGET SADD SREM SMEMBERS SISMEMBER SCARD MULTI EVAL` | Instance registry and tokens (ADR-0023) |
| message-manager | `trading-model:message-manager:subscriptions:<topic>` | `HSET HGETALL HDEL PEXPIRE` | Broker subscriptions |
| dlq-service | `rl:dlq:<name>:*` | `EVAL/EVALSHA SCRIPT` (rate-limit-redis) | HTTP rate limiter |

Dead letters live in MongoDB, not Redis.

## Schema Validation

The message broker uses **Zod validation schemas** at `services/message-manager/src/adapters/inbound/validation/broker.schema.ts` to enforce message shapes, subscriptions, and metadata.
