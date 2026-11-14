# ADR-0040: Locked, Resumable Schema Migrations and the Expand/Contract Rule

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0020](./0020-database-topology-as-deployed.md) (MySQL as deployed), [ADR-0031](./0031-point-in-time-recovery-hourly-archives.md) (recovery when a migration destroys data)
**Verified by:** `services/financial-scraper/tests/db/migrate.db.spec.ts` (lock, resume, checksum), manual review 2026-11-05 (expand/contract rule), `tests/k8s/run-kind.sh` (upgrade step: release N-1 rolled back onto schema N, migrate-down 1 then up)

## Context

`scripts/migrate.mjs` sent each file as one multi-statement query and wrote its `_migrations` row only after the whole file succeeded. MySQL DDL commits on its own, so a failure half-way through a file (e.g. `004`: two `DELETE`, then two `ALTER`) left the schema changed with no trace, and the rerun failed on, or replayed, the statements that had already run. Nothing stopped two runs at once. A changed checksum was only shown by `status`; `up` ignored it. `deploy.yml` runs the migrations before the canary and the rollout, so release N-1 runs on schema N during the rollout and after a rollback, with no written rule that keeps that safe (audit deploiement 2026-11-05, C3, issue #412).

## Decision

1. **Lock.** `up` and `down` take `GET_LOCK('schema_migrations', 120)` before reading `_migrations`, fail with an explicit error when it is not obtained within 120 s, and release it in `finally`. A second run waits for the first, then finds its migrations applied. `status` and `create` take no lock.
2. **One statement per step, journaled.** Each file is split on the `;` outside quotes, backticks and comments. Each statement runs in a transaction with its row in `_migration_steps` (`migration_id`, `direction`, `step`, `checksum`). The `_migrations` row (or its deletion for `down`) and the removal of the journal rows commit together once the file is done. A rerun resumes after the last journaled statement. The failed statement may be fixed before the rerun; one that already ran may not (its checksum is compared, the run stops). Half-way through one direction, the other direction is refused until it is finished. The existing files and `_migrations` rows stay valid as they are.
3. **Changed files are refused.** `up` stops before running anything when an applied migration's file no longer matches its checksum: the change goes in a new migration.
4. **Expand/contract.** The schema of release N must serve releases N and N-1:
   - **expand** (release N): add a table, a nullable or defaulted column, an index, a wider type; backfill data in a way N-1 tolerates;
   - **forbidden in the release that stops using it**: drop or rename a table or column N-1 reads or writes, narrow a type, add `NOT NULL` without a default, add a constraint N-1's writes break, delete rows N-1 still needs;
   - **contract** (release N+1 or later, once no running or rollback-target release uses it): drop what is no longer read.
   A rename is an expand (new column, dual write, backfill) then a contract two releases later.
5. **Consequences for `deploy.yml`.** "Run database migrations" stays before "Canary deployments" and "Apply overlay": this is only safe under rule 4, since the canary and every primary still on N-1 run on schema N. "Rollback on failure" and `rollout undo` roll the Deployments back to N-1 and never run `down`: under rule 4, N-1 works on schema N. `migrate-down` (`deploy-k8s.sh`) is a manual operator step for a migration that is itself wrong, not part of a release rollback. A migration that fails stops the deploy before the canary; rerunning the deploy resumes it at the failed statement.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Idempotent statements imposed and checked (`IF EXISTS` / `IF NOT EXISTS`) | MySQL has no `IF EXISTS` for `DROP PRIMARY KEY`, most `ALTER ... ADD` clauses or a dedup `DELETE`; would need rewriting the applied files (out of scope) and a SQL linter |
| Transaction around the whole file | MySQL DDL commits implicitly; only DML would be covered |
| Third-party migrator (Flyway, Liquibase, dbmate) | New runtime in the migration image for three features; Flyway OSS has no per-statement resume either |
| Advisory lock through a row in `_migrations` | Stays held when the process dies; `GET_LOCK` is freed with the connection |

## Consequences

- An interrupted migration is resumed by rerunning `up`; no manual SQL.
- One window is left: a crash after a DDL statement commits and before its journal row commits replays that statement on the rerun (DML commits with its row, so it is not replayed). The rerun then fails on it, visibly; fix by inserting the missing `_migration_steps` row by hand.
- Stored programs (`DELIMITER`, `BEGIN ... END` bodies) cannot be written in a migration file; `DELIMITER` is refused.
- `GET_LOCK` names are server-wide: two schemas on the same MySQL server share the lock and are serialized too.
- Rule 4 is checked by review, not by CI. Proposed follow-up: a CI job running the specs of release N-1 against the schema of release N (to be implemented with the deploy verification work, audit C4).

## Amendment 2026-11 (issue #767): MySQL client TLS

See [ADR-0060](./0060-database-client-traffic-unencrypted-in-cluster.md) (MySQL part done).

`scripts/migrate.mjs` reads `DB_SSL_CA` and then verifies the server certificate and host name; the migration Jobs mount Secret `mysql-client-migrator` (CA + client certificate). Exception to expand/contract, decided by the owner (2026-11-09): TLS and `require_secure_transport=ON` ship in the same release instead of N and N+1.

`DB_SSL_CERT` / `DB_SSL_KEY` carry the client certificate of user `migrator`. `require_secure_transport=ON` is enabled in the same release as the TLS support (owner decision, 2026-11-09): the pods of release N-1 lose their connection until replaced by the rolling update, a brief interruption accepted for this step.
