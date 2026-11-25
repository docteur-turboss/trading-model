# ADR-0088: Paged Market Read Indexes Are Built Outside the Migration Job

**Status:** Accepted
**Date:** 2026-11
**Amends:** [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (long index builds leave the migration Job), [ADR-0054](./0054-public-read-pagination-and-proxy-response-cap.md) (the 3 `sources/:source` routes are removed)
**Related:** [ADR-0061](./0061-n-1-compatibility-of-public-api-and-bus-messages.md) (public contract change)
**Verified by:** `services/financial-scraper/tests/db/market-data.db.spec.ts` (no filesort in the plan, idempotent build, plan of the latest-candle read), `tests/k8s/run-migrations.test.sh` (the build Job is applied, not waited for), `bun run api:check`

## Context

The paged reads (`pagedSelect`) run `WHERE symbol = ? ORDER BY timestamp, id LIMIT n`. No index serves that order: MySQL reads and sorts every row of the symbol (filesort), per page. No index starts with `source` either, so `.../sources/:source` scanned the whole table. Issue #1378 added the composite indexes in a migration; issue #1473 removed it because on `market_candles` (9.66 M rows on staging-local) the online builds took 973 s for 2 M rows, past the 720 s of the `db-migrate` Job (issue #2057).

## Decision

- **Index:** `(symbol, timestamp, id)` on `market_candles`, `market_trades`, `market_tickers` (`idx_*_symbol_ts`), replacing `idx_*_symbol` (a prefix of every primary key already). One `ALTER TABLE ... ADD INDEX ..., DROP INDEX ..., ALGORITHM=INPLACE, LOCK=NONE` per table: one pass, writes continue.
- **Built by `scripts/migrate.mjs index-build`, not by a migration.** It reads `information_schema`, builds what is missing and drops the redundant index, so it is idempotent: a failed or killed build (the server rolls the ALTER back) restarts that table, a rerun skips what exists. Its own named lock `index_build` keeps two builds apart without blocking migrations.
- **Own Job `db-index-build`** (`deploy/k8s/jobs/index-build-job.yaml`): same image, user (`migrator`) and ServiceAccount as `db-migrate`, `activeDeadlineSeconds` 24 h, `backoffLimit` 3. `run-migrations.sh` applies it last and does not wait: no deploy blocks on it, and a build still running is left alone. Reads are slower until it ends, as before this change. Compose runs it once after `migrate` (`index-build` service).
- **Routes removed:** `GET /v2/{candles,ticker,trade}/sources/:source` (scraper, `PUBLIC_ROUTES`, OpenAPI). No internal caller exists; an index `(source, timestamp, id)` would triple the build cost for them. Breaking for an external client of these routes; `symbols/:symbol` gives the same rows per symbol.

## Consequences

- Schema is not fully described by the migrations: the five indexes exist after `index-build`. A fresh database has the old `idx_*_symbol` until it runs; `migrate.mjs down` of the baseline needs no change (it drops the tables).
- A failed build is visible as a failed Job `db-index-build` (kept 10 min by `ttlSecondsAfterFinished`); no alert covers it yet.
- The ALTER takes a metadata lock at its start and end; behind a long transaction (the nightly `mysqldump --single-transaction`) it would queue every INSERT and SELECT on the table for the server's `lock_wait_timeout` (1 year). `index-build` sets 5 s on its session and, on error 1205, logs, pauses 10 s and retries (60 attempts at most): writers wait 5 s at worst (issue #2497).
- Future long builds add a row to `PAGED_READ_INDEXES` or a sibling list, not a migration.
- The latest-candle read of risk-execution (`selectLatestClosedCandles`) has no index of its own (migration 014 `(symbol, close_timestamp)` removed before any release, issue #2592): one `LIMIT 1` per symbol bounded to candles opened in the last hour, a range on `idx_candles_symbol_ts` or, before the build, `idx_candles_timestamp` (19 ms on 1.8 M rows in both cases), capped by `MAX_EXECUTION_TIME`.
- The build duration on 10 M rows is not measured in CI (kind has a few rows): measure on staging-local before the release.
