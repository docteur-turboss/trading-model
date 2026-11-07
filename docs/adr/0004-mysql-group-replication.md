# ADR-0004: MySQL with Group Replication for Market Data

**Status:** Superseded by [ADR-0020](./0020-database-topology-as-deployed.md)
**Date:** 2026-06

## Context

The financial-scraper service stores market data (candles, trades, tickers) with strict consistency requirements. Data must be:

- ACID-compliant (no partial writes)
- Queryable by symbol, timestamp, and interval
- Highly available with automatic failover

## Decision

Use **MySQL 8** with **Group Replication** (multi-primary mode) for market data persistence.

### Schema

Each data type has a dedicated table with composite primary keys:

- `market_candles` — OHLCV data (PK: symbol, market, source, interval_value, timestamp)
- `market_trades` — Individual trades (PK: symbol, market, source, trade_id, timestamp)
- `market_tickers` — 24h stats (PK: symbol, market, source, timestamp)

## Alternatives Considered

| Alternative              | Reason for Rejection                                             |
| ------------------------ | ---------------------------------------------------------------- |
| TimescaleDB (PostgreSQL) | Additional infrastructure; team has less PostgreSQL expertise    |
| InfluxDB                 | Time-series optimized but adds another DB platform               |
| MongoDB                  | No ACID guarantees for financial data; eventual consistency risk |
| SQLite                   | Not network-accessible; no replication                           |

## Consequences

### Positive

- ACID compliance guarantees data integrity for financial records
- Group Replication provides automatic failover with multi-primary writes
- Composite PKs enable efficient time-range queries
- `ts-sql-query` provides type-safe SQL with connection pooling

### Negative

- Schema migrations require careful planning (handled via `scripts/migrate.mjs`)
- Group Replication adds latency for cross-node synchronization
- Composite PKs increase index size

### Mitigations

- `INVISIBLE` indexes on timestamp avoid optimizer confusion while enabling historical queries
- *Amendment 2026-11-07 (#555):* this left every `timestamp` query scanning the whole table (primary keys start with `symbol`). Migration `007_make_timestamp_indexes_visible` makes the three indexes visible.
- Binance rate limiting (token bucket) prevents API bans
- Exponential backoff (5 retries, 300ms–10s) handles transient failures
