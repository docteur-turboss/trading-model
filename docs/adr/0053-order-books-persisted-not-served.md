# ADR-0053: Order Books Persisted in MySQL for Replay, Not Served by the API

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) (routes and OpenAPI from the Zod schemas), [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md) (no orphan code), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand-only migration), [ADR-0042](./0042-singleton-collector-with-verified-recovery.md) (one collector pod, HTTP replicas apart), [ADR-0051](./0051-mysql-retention-cronjob.md) (retention job)
**Verified by:** `services/financial-scraper/tests/db/market-data.db.spec.ts`, `services/financial-scraper/tests/db/retention.db.spec.ts`, `bun run api:check`, `bun run reach:check`

## Context

Each scrape put the order book snapshot (100 bids + 100 asks per symbol) in a process-wide `Map` and its indexes, with no eviction (issue #554, performance audit 2026-11-07, C2): the singleton collector grew about 47 MB a day for 2 symbols until OOMKill. In K8s the HTTP replicas never scrape, so the four `/orderbook/...` routes reading that `Map` always answered `[]`. No service and no contract test calls them; the trainer gets order books on the bus. Unlike candles, trades and tickers, order books were never written to MySQL, so no history existed for a later replay.

## Decision

1. **No route.** The four `/orderbook/...` routes, their Zod schemas, their `PUBLIC_ROUTES` entries and the in-memory store with its index are removed (owner's choice, option 1 on issue #554). The OpenAPI is regenerated.
2. **Persisted for replay.** Each snapshot is upserted into `market_order_books` (migration 008, expand-only): `symbol`, `market`, `source`, `timestamp` as primary key, `bids` / `asks` as JSON arrays of `[price, quantity]` pairs, best level first. A snapshot is read whole, never level by level, so one row per snapshot. A replayed snapshot overwrites its row.
3. **Retention like the other market data.** `scripts/retention-mysql.sh` purges the table on `timestamp` after `RETENTION_ORDER_BOOKS_DAYS` (default `RETENTION_DAYS`); the `retention` user gets `SELECT, DELETE` on it from `db-migrate-user`.
4. **Bus unchanged.** The collector still publishes the order book; the trainer still reads it there.

## Consequences

- The collector holds no order book in memory: its memory no longer grows with its uptime.
- Removing the routes breaks any outside caller of the gateway order book routes; none is known.
- Volume: about 5-6 KB per snapshot (JSON + InnoDB), roughly 15-20 MB a day for 2 symbols at one snapshot a minute, about 6 GB a year, 30 GB at the 5-year default retention; it grows with the symbols and goes into the dumps (ADR-0032). The K8s CronJob therefore sets `RETENTION_ORDER_BOOKS_DAYS` to 180 (default `RETENTION_DAYS`, as for signals): 180 × 18 MB ≈ 3.2 GB, about 16 % of the 20 Gi MySQL volume, with room left for candles, trades, tickers, signals and binlogs.
- A replay reads the table directly (no route): a route, if one is needed later, must read MySQL, never a process-local store.
