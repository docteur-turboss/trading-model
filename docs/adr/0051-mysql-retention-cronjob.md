# ADR-0051: MySQL Retention Job for Market Data and Signals (CronJob, `retention` User)

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0031](./0031-point-in-time-recovery-hourly-archives.md) (the deletes go through the binlogs), [ADR-0032](./0032-gfs-backup-retention.md) (5-year dumps), [ADR-0036](./0036-multi-dimension-signals-mvp.md) (never filter signals at ingestion), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (no edit of an applied migration), [ADR-0041](./0041-least-privilege-deploy-identities.md), [ADR-0047](./0047-redis-isolation-per-service.md) (one least-privilege user per consumer)
**Verified by:** `services/financial-scraper/tests/db/retention.db.spec.ts`, `bun run config:check`, `scripts/observability-gate.mjs`

## Context

Migration 003 no longer holds the purge (a `DELETE` in a migration is irreversible, audit A9) and pointed at a retention job that did not exist: `market_candles`, `market_trades`, `market_tickers` and `signals` grew without bound, and so did the dumps (issue #534). There is no order-book table. *Amended by [ADR-0053](./0053-order-books-persisted-not-served.md): `market_order_books` is a fifth table, purged on `timestamp` after `RETENTION_DAYS`.*

## Decision

1. **MySQL identity.** User `retention`: `SELECT, DELETE` on the four tables only, granted table by table by `db-migrate-user`. Password: key `MYSQL_RETENTION_PASSWORD` of `trading-model-secrets`. The key is optional in the Job (a cluster without it skips the user and `db-retention` fails visibly) so no existing deploy breaks; production must seal it before the first deploy. `migrator` (DDL) is not reused. `db-migrate-user` runs a second time after the migrations, because a grant on a table needs the table.
2. **Where it lives.** CronJob `db-retention` (`deploy/k8s/jobs/`), daily 03:30 UTC, image `backup-tools` (already released, digest-pinned, has the `mysql` client), script `scripts/retention-mysql.sh` from the `backup-scripts` ConfigMap, Pod Security `restricted`. No new image, no new kind. Compose: the same script run by the host in the MySQL container.
3. **Durations.** `RETENTION_DAYS` (default 1827) for market data, `RETENTION_SIGNALS_DAYS` (default: `RETENTION_DAYS`) for signals. Market data is purged on `timestamp`, signals on `observed_at`.
4. **Method.** `DELETE ... WHERE <column> < UTC_TIMESTAMP(3) - INTERVAL n DAY LIMIT RETENTION_BATCH_SIZE`, pause between batches, until a batch is not full. Idempotent. The session enables invisible indexes (the `timestamp` indexes are visible since migration 007, #555; the session setting is kept for a not-yet-migrated or rolled-back database). Invalid durations stop the run before any delete. One failing table does not stop the others; the exit code is 1.
5. **Observability.** `retention.prom` on the backup volume, served by the existing exporter: `retention_last_run_rows_deleted{table}`, `retention_last_success_timestamp`, `retention_last_status`, `retention_last_run_duration_seconds`. Alerts `RetentionFailed` (status 0) and `RetentionStale` (36 h without success).
6. **Migration 003 is left as is** (applied migration, checksum rule of ADR-0040); the policy document and the runbook describe the job.

## Consequences

- Deletes appear in the binlogs: PITR replays them, as expected. A first purge of a large backlog writes a lot of binlog.
- The MySQL dumps keep 5 years (ADR-0032), so a purged row stays restorable from older dumps until they expire.
- A job that never ran has no metric: `RetentionStale` needs one run (success or failure) to exist.
- Partitioning with `DROP PARTITION` stays an option at larger volume; out of scope.
