# ADR-0031: Point-in-Time Recovery From Hourly Binlog and Oplog Archives (RPO 1 h, 72 h Window)

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0020](./0020-database-topology-as-deployed.md) (database topology), [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) (audit chain, acknowledged losses), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `tests/backup/pitr-chain.test.sh`, `tests/backup/fetch-offsite.test.sh`, `tests/alerts/run.sh`, `tests/k8s/run-kind.sh`

## Context

The 2026-11-01 backup and restore audit (finding A6, issue #291) found an effective RPO of 24 h for every database: one dump a day at 02:00 (CronJob `db-backup`), no restore to an instant between two dumps.

- MySQL writes binlogs (`log-bin`, ROW, GTID, `deploy/k8s/infra/mysql.yaml`) that nobody copied: they live and die with the volume of `mysql-0`, the only member holding data (ADR-0020). The same server holds `financial_scraper` and the SPIRE datastore.
- MongoDB's oplog was only captured during the dump (`mongodump --oplog`).
- `BACKUP_DR.md` stated it ("RPO is 24 h") while the audit trail (`mongo-audit`) is classified Critical: an incident late in the day lost up to 24 h of audit events, candles and dead letters, and left a hole in the audit chain to acknowledge (ADR-0027).

The project owner chose on 2026-11-03 (issue #291): **RPO 1 h**; keep the frequent backups for the **last 72 hours** only, and only the daily backups beyond that, to save storage.

## Decision

### RPO and retention

| Data | RPO | Point-in-time window | Older |
| --- | --- | --- | --- |
| MongoDB `mongo-audit` (audit trail) | 1 h | last 72 h | daily backups, 30 days |
| MongoDB `mongo-dlq` (dead letters) | 1 h | last 72 h | daily backups, 30 days |
| MySQL (`financial_scraper`, SPIRE datastore `spire`) | 1 h | last 72 h | daily backups, 30 days |
| SPIRE CA keys (`keys.json`) | 24 h | — | a file without journal: daily backup only |

*Amended by [ADR-0065](./0065-spire-datastore-sqlite-and-4h-svid-ttl.md): the SPIRE datastore moved to SQLite on the server volume; it is backed up daily with its CA keys (RPO 24 h), not through the binlogs.*

The incremental archives are kept 72 h (`INCREMENTAL_RETENTION_HOURS`); the daily backups keep their own retention (`RETENTION_DAYS`, 30 days, or what the GFS issue #292 decides). Off-site, the bucket lifecycle expires `mysql/binlog/` and `mongodb/oplog/` after 3 days.

### Mechanism: our scripts, hourly

A CronJob `db-backup-incremental` runs `scripts/backup-incremental-k8s.sh` every hour (minute 30, away from the 02:00 dump), with the `db-backup` volume, age recipients, off-site store and RBAC:

- **MySQL**: `FLUSH BINARY LOGS` on `mysql-0`, then each closed binlog not archived yet is read from the pod with `cat` (no password on a command line), gzipped and sealed with age: `mysql/binlog/<server_uuid>/<binlog>_<stamp>.gz.age`. One directory per server uuid: a recreated volume restarts the numbering.
- **MongoDB**: on each replica set's primary, the oplog entries from the end of the previous archive to the newest one (`mongodump --db local --collection oplog.rs --query`, inclusive bounds): `mongodb/oplog/<label>/<from>_<end>.bson.gz.age`. The next archive starts where the last ended (one entry shared, replaying it twice is harmless): the chain state is in the file names, nothing else.
- Every file goes through `.partial` and is renamed once complete. A gap (binlog purged before being archived, oplog entries overwritten) fails the run and restarts the chain. Each run copies off-site every archive still on the volume, not only its own, so a failed copy is caught up by the next run and the off-site chain has no hole.
- The daily dump records its starting point, sealed next to it: binlog coordinates from `mysqldump --source-data=2` and the server uuid (`financial_scraper_<stamp>.pitr.age`), the newest oplog entry read before `mongodump` (`<label>.pitr.age`).

`restore-k8s.sh --until <instant>` restores the newest daily backup taken before the instant (the newest such run whose run manifest lists the component, as `resolve_backup` picks it, issue #288), then replays: `mysqlbinlog --skip-gtids --start-position --stop-datetime` piped into `mysql-primary` (through the binlog, without `SQL_LOG_BIN=0`, so the replicas follow; new GTIDs because the server may still hold the original ones), and `mongorestore --oplogReplay --oplogLimit` on the primary. Before touching any data it checks every requested component (dumps, archives reaching the instant without a gap, each archive decrypted once): exit 1 otherwise, every database left as it was.

`mysqlbinlog` is in neither the mysql image (server minimal) nor alpine (MariaDB's client does not read MySQL 8.4 binlogs): the `backup-tools` image moves to Oracle Linux 9 slim, with `mysql-community-client` from the official MySQL repository at the server's version (checked with the key the mysql image ships), age and rclone from Oracle's EPEL mirror. No new image.

Monitoring: `backup_last_success_timestamp` / `backup_last_status` with `run="incremental"` and components `mysql-binlog`, `mongodb-oplog`, `mongodb-audit-oplog` (separate metrics file, served by the same exporter); alerts `BackupIncrementalStale` (2 h, twice the interval), `BackupIncrementalMissing` and `BackupIncrementalFailed` (a failed run, retried by the next one). A gap is not visible in those once the next run succeeds, so every run also publishes `backup_pitr_gap`, derived from the archive names (a break after the newest daily dump of the store), and `BackupPitrGap` fires until a daily dump taken after the break exists.

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| RPO 15 min (proposed in the issue) | The owner chose 1 h |
| Keep the incremental archives as long as the daily dumps (30 days) | The owner chose 72 h to save storage: candle binlogs (ROW) are the bulk of the volume |
| Percona Backup for MongoDB (continuous oplog slices) | Writes to S3 itself without age (server-side encryption only), breaking the rule that nothing leaves unencrypted; one more image and agent per `mongod`; MySQL would still need its own mechanism |
| Hourly full dumps, no `--until` | Cost grows with the data volume, no restore to an instant |
| Replay the binlogs through the replication applier (relay logs) instead of `mysqlbinlog` | Avoids the client package, but with GTIDs a same-server restore skips every transaction the server already executed; needs relay-log surgery on the live pod |
| A separate image for `mysqlbinlog` | One more image to release, pin and pull for every restore; `backup-tools` already runs the restores |

## Consequences

### Positive

- At most 1 h of audit events, dead letters and market data lost with a volume, instead of 24 h; the hole to acknowledge in the audit chain (ADR-0027) shrinks accordingly.
- Restore to an instant before a logical error (bad migration, wrong delete) over the last 72 h.
- The CI drill (`tests/k8s/run-kind.sh`, `verify_backup`) writes after the dump, archives, destroys and restores with `--until`, and checks that those writes come back, nothing after the instant does, and the audit chain verifies.

### Negative

- Not continuous: what was written since the last hourly archive is lost.
- Older than 72 h, restores are day by day.
- `backup-tools` grows (Oracle Linux base, MySQL client): about 750 MB uncompressed. It is pulled by the backup jobs and restores only.
- Writers must be stopped during a point-in-time restore: a row written between the dump restore and the replay makes the replay fail (exit 1).
- Kubernetes only: the Docker scripts keep the daily dump (compose MongoDB is no replica set).
