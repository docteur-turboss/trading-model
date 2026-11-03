# Backup & Disaster Recovery

## Overview

This document defines the backup strategy, disaster recovery procedures, and
restore verification for the trading-model platform.

> **Status (2026-10-28):** a backup counts only once it has been restored.
> Both sets of scripts are restored for real by CI:
>
> - Kubernetes: every run of the CI `k8s` job backs up with the `db-backup`
>   CronJob, stops the MongoDB writers, destroys data (the real `audit` and
>   `dlq` databases, drill markers, the `market_candles` table, the SPIRE
>   server volume) and restores it with `scripts/restore-k8s.sh`
>   (`tests/k8s/run-kind.sh`, `verify_backup`). The audit trail written by
>   audit-logger from the live flow must come back whole: same events, same
>   hashes, hash chain verified (`tests/backup/audit-chain.js`), then extended
>   by audit-logger after the restore.
> - Docker: `backup-test.yml` (weekly and on changes to the scripts) deletes
>   the containers and their volumes and restores them with
>   `scripts/restore.sh` (`tests/backup/compose-restore-drill.sh`). Last run
>   passed on 2026-10-28.
>
> Known limits are listed at the end of this document.

## Data Classification

| Data Store                    | Service                                       | Criticality | RPO (actual)           | RTO Target |
| ----------------------------- | --------------------------------------------- | ----------- | ---------------------- | ---------- |
| MongoDB `mongo-audit`         | audit-logger                                  | Critical    | 1 h (hourly oplog archive; point in time over the last 72 h) | 4 hours    |
| MongoDB `mongo-dlq`           | dlq-service                                   | High        | 1 h (hourly oplog archive; point in time over the last 72 h) | 4 hours    |
| MySQL `financial_scraper`     | financial-scraper                             | High        | 1 h (hourly binlog archive; point in time over the last 72 h) | 4 hours    |
| MySQL `spire`                 | SPIRE Server (datastore)                      | Critical    | 1 h (hourly binlog archive) | 4 hours    |
| SPIRE `keys.json`             | SPIRE Server (CA private keys)                | Critical    | 24 h (daily backup: a file, no journal) | 4 hours    |
| Trained agents                | trader-trainer (checkpoint files)             | Medium      | 24 h (daily tar)       | 1 hour     |
| Redis                         | discovery-server, dlq-service, readiness      | Low         | Not backed up          | Rebuilt    |

Redis only holds derived state: instance registrations and tokens (services
register again), the DLQ retry queue (rebuilt from MongoDB by dlq-service)
and readiness keys. A day-old snapshot would restore stale tokens and queue
entries, so Redis is not backed up in Kubernetes. The Docker scripts still
dump it (single node). With `REDIS_APPENDONLY=yes` Redis starts from its
append-only file and would ignore a restored `dump.rdb`: `scripts/restore.sh`
loads the snapshot in a throwaway server on the same volume and rewrites the
AOF from it before starting Redis again.

## Automated Backup System

### Kubernetes

The CronJob `db-backup` (`deploy/k8s/jobs/backup-cronjob.yaml`) runs daily at
2:00 AM with the `backup-tools` image (`deploy/backup`: kubectl, age, rclone,
mysqlbinlog)
and the scripts from the `backup-scripts` ConfigMap.

```bash
# Manual run
kubectl create job --from=cronjob/db-backup db-backup-manual
```

The job fails (and its alerts fire) when:

- no age recipient is configured (`BACKUP_REQUIRE_ENCRYPTION=true`);
- no off-site store is configured, or the copy fails (`BACKUP_REQUIRE_OFFSITE=true`):
  a single volume is not a backup;
- any component cannot be found or dumped (missing pod, no MongoDB primary...).

Each dump also records where point-in-time recovery starts from it, in a
sealed file next to it: `mysql/financial_scraper_<stamp>.pitr.age` (server
uuid and binlog coordinates, written by `mysqldump --source-data=2`) and
`mongodb/<stamp>/<label>.pitr.age` (newest oplog entry read before the dump).

#### Point-in-time archives (ADR-0031)

The CronJob `db-backup-incremental`
(`deploy/k8s/jobs/backup-incremental-cronjob.yaml`) runs
`scripts/backup-incremental-k8s.sh` every hour at minute 30, same image,
volume, age recipients and off-site store. **RPO: 1 h** for MySQL
(`financial_scraper` and the SPIRE datastore) and both MongoDB replica sets.

- **MySQL**: `FLUSH BINARY LOGS` on `mysql-0`, then every closed binlog not yet
  archived is read from the pod (`cat`, no password on a command line),
  gzipped and sealed: `mysql/binlog/<server_uuid>/<binlog>_<stamp>.gz.age`.
  One directory per server: a recreated volume restarts the numbering.
- **MongoDB**: the oplog entries since the end of the previous archive, from
  each replica set's primary (`mongodump --db local --collection oplog.rs
  --query …`): `mongodb/oplog/<label>/<from>_<end>.bson.gz.age`. The next
  archive starts at this one's end, so the chain state is in the file names.
- Every file is written as `.partial` and renamed once complete: a failed run
  leaves no final file, and the next run sweeps its `.partial`.
- A gap is a failure (`backup_last_status{…,run="incremental"} 0`): a binlog
  purged by MySQL before being archived, or oplog entries overwritten before
  being archived. The chain then restarts and point-in-time restore across
  the gap is refused. MySQL keeps binlogs 30 days (`binlog_expire_logs_seconds`
  default), the oplog window is hours to days: an hourly run never comes close.

```bash
kubectl create job --from=cronjob/db-backup-incremental db-backup-incremental-manual
```

### Docker

```bash
# Full backup (all components)
bash scripts/backup.sh

# Selective backup
bash scripts/backup.sh --components mongodb,mysql

# Dry-run (preview without executing)
bash scripts/backup.sh --dry-run

# Encrypted (age public key; refuse to run without it)
BACKUP_AGE_RECIPIENTS=age1... BACKUP_REQUIRE_ENCRYPTION=true bash scripts/backup.sh

# With off-site upload (encrypted files only)
BACKUP_AGE_RECIPIENTS=age1... BACKUP_S3_BUCKET=s3://my-bucket/backups bash scripts/backup.sh
```

Docker has no scheduler: schedule `backup.sh` with the host's cron if a compose
stack holds data that matters.

### Components Backed Up

| Component                                  | Method                                                         | Consistency                       |
| ------------------------------------------ | -------------------------------------------------------------- | --------------------------------- |
| MongoDB dlq and audit (one dump per replica set, from its primary) | `mongodump --gzip --oplog --archive`   | Point-in-time (end of the dump)   |
| MongoDB (Docker: message-manager, audit-logger, dlq) | `mongodump --gzip --archive` (standalone)            | Per collection                    |
| MySQL, every non-system database (`financial_scraper`, `spire`) | `mysqldump --databases … --single-transaction --set-gtid-purged=OFF` | Transaction-consistent snapshot |
| Trainer checkpoints                        | `tar czf` of `/data/checkpoints/`                              | Filesystem snapshot               |
| SPIRE CA keys, K8s (`keys.json`)           | read through the `spire-entries` sidecar (read-only mount)     | File copy; datastore is in MySQL  |
| SPIRE server, Docker (`/run/spire/data`)   | `docker cp` of the whole directory, server paused              | keys.json + SQLite datastore together |
| Redis (Docker only)                        | `BGSAVE`, wait for `LASTSAVE`, stream `dump.rdb`               | Fork-consistent                   |

The `mysql` system schema is not dumped (it cannot be restored over a running
server); users come from the deployment (`MYSQL_ROOT_PASSWORD`, `MYSQL_USER`).
Dumps carry no GTID statement, so a restore goes through the binlog to the
replicas. Older dumps taken with GTID statements (before 2026-10-28) are
filtered at restore time (`strip_gtid` in `scripts/backup-lib.sh`); without
the filter they fail with `ERROR 3546 GTID_PURGED`.

Every dump is streamed through `age` before it touches a disk (files suffixed
`.age`). Keys, restore and monitoring:
[Encryption at Rest](ENCRYPTION_AT_REST.md#2-backups-age).

### Off-site Storage (mandatory in Kubernetes)

`BACKUP_S3_BUCKET` copies each run's encrypted files to any S3-compatible store
(rclone, or the `aws` CLI as fallback). Only encrypted files leave: without
`BACKUP_AGE_RECIPIENTS` the copy is refused.

In Kubernetes the Secret `trading-model-backup-s3` holds `BACKUP_S3_BUCKET`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and for a non-AWS
store (MinIO on another VPS, Backblaze B2, Scaleway, OVH...) `S3_ENDPOINT` and
`S3_PROVIDER`. `deploy.yml` writes it from the GitHub environment: variables
`BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT`,
`BACKUP_S3_PROVIDER`, secrets `BACKUP_S3_ACCESS_KEY_ID`,
`BACKUP_S3_SECRET_ACCESS_KEY`. Without them, an existing Secret (e.g. a
SealedSecret) is kept. Enable versioning or object lock on the bucket: the
job only adds files, retention off-site is the bucket's lifecycle rule.

### Retention

- `backup-data` volume: daily backups 30 days (`RETENTION_DAYS`, files pruned
  by `prune_old`); binlog and oplog archives 72 h
  (`INCREMENTAL_RETENTION_HOURS`, pruned by `backup-incremental-k8s.sh`).
  Past 72 h only the daily backups remain: point in time over the last 72 h,
  day by day before that (ADR-0031).
- Off-site: the bucket's lifecycle rule. Give the prefixes `mysql/binlog/` and
  `mongodb/oplog/` a 3-day expiry to match: the job does not delete off-site.

## Monitoring

`backup-k8s.sh` writes `/backups/metrics/backup.prom`,
`backup-incremental-k8s.sh` writes `/backups/metrics/backup-incremental.prom`
(every series labelled `run="incremental"`; components `mysql-binlog`,
`mongodb-oplog`, `mongodb-audit-oplog`). `backup-metrics-exporter` serves both
and Prometheus scrapes them (job `backup-metrics`).

| Alert                     | Fires when                                                                   |
| ------------------------- | ---------------------------------------------------------------------------- |
| `BackupFailed`            | a component's last success is older than 25 h                                |
| `BackupNotRunning`        | a component never succeeded                                                  |
| `BackupComponentMissing`  | a component (mongodb, mongodb-audit, mysql, spire, checkpoints) reports nothing |
| `BackupJobStale`          | the job has not run for 26 h                                                 |
| `BackupIncrementalStale`  | a binlog / oplog archive last succeeded more than 2 h ago (2 × the interval) |
| `BackupIncrementalMissing` | a binlog / oplog component reported nothing for 2 h                        |
| `BackupMetricsAbsent`     | no backup metric at all (job never ran, exporter down)                       |
| `BackupUnencrypted`       | no age recipient                                                             |
| `BackupOffsiteCopyFailed` | the off-site copy failed or is not configured                                |

## Restore Procedures

Encrypted backups (`*.age`) need the age private key:
`BACKUP_AGE_IDENTITY=~/backup-key.txt` in front of any restore command below.
Manual decryption: `age -d -i backup-key.txt <file>.age`.

Both restore scripts exit 1 if any step fails. Stop the writers first
(`kubectl scale deployment --replicas=0` for financial-scraper,
financial-scraper-collector, dlq-service, audit-logger, message-manager) when
restoring after data corruption: a restore running next to live writers can
collide with their inserts.

After a restore of the audit database, `AuditChainBroken` fires when anchors
were written after the backup (ADR-0027): those events are lost. Once the
restore is explained, acknowledge the loss
([runbook-audit-chain-broken](../operations/runbooks/runbook-audit-chain-broken.md#after-a-restore-from-an-older-backup)).

### Kubernetes

`restore-k8s.sh` needs namespace admin rights: exec into the databases, stop
and start the SPIRE server, create a helper pod. Order matters: MySQL (which
holds the SPIRE datastore) before SPIRE.

From a workstation, with the backup files copied locally:

```bash
BACKUP_DIR=./backups K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
  bash scripts/restore-k8s.sh                      # mongodb,mysql,checkpoints,spire
bash scripts/restore-k8s.sh --timestamp 2026-10-01_020000 --components mongodb
```

Or inside the cluster, next to the `backup-data` volume: a pod running
`backup-tools` with the `backup-scripts` ConfigMap at `/scripts` and
`backup-data` at `/backups` (as `tests/k8s/restore-runner.yaml` does), the
private key passed on stdin:

```bash
kubectl exec -i -n trading-model restore-runner -- sh -c \
  'umask 077 && cat > /tmp/id && BACKUP_AGE_IDENTITY=/tmp/id K8S_NAMESPACE=trading-model \
   bash /scripts/restore-k8s.sh; rc=$?; rm -f /tmp/id; exit $rc' < ~/backup-key.txt
```

What it does:

- **MongoDB**: finds the writable primary of each replica set and runs
  `mongorestore --drop --oplogReplay` there (secondaries follow).
- **MySQL**: pipes the dump (GTID statements filtered) into the pod behind
  `mysql-primary`, with the container's own root password.
- **SPIRE**: scales `spire-server` to 0, writes `keys.json` into its volume
  from a helper pod (`RESTORE_HELPER_IMAGE`, default `backup-tools`) running as
  the server's user, scales it back and checks `spire-server healthcheck`.

#### Point-in-time restore (`--until`, ADR-0031)

```bash
# State just before 13:45 UTC (the instant itself excluded)
bash scripts/restore-k8s.sh --until 2026-11-03T13:45:00Z
bash scripts/restore-k8s.sh --until '2026-11-03 13:45' --components mongodb
```

For each database, `restore-k8s.sh` takes the newest daily backup taken
before the instant (the checkpoints and SPIRE keys too), then:

1. reads its `.pitr` file and lists the archives from that point to the
   instant: **exit 1, nothing touched**, when one is missing (gap), when the
   archives stop before the instant (the next hourly run has not happened yet:
   pick an earlier instant or run `db-backup-incremental` by hand first), or
   when the dump predates ADR-0031 (no `.pitr`);
2. decrypts and decompresses every archive once, output discarded: a wrong
   key or a damaged file also fails before any data is touched;
3. restores the dump, as above;
4. replays up to the instant:
   - **MySQL**: `mysqlbinlog --skip-gtids --start-position=<dump> --stop-datetime=<instant>`
     (run in the restore pod: `mysqlbinlog` is in `backup-tools`, not in the
     mysql image) piped into `mysql` on `mysql-primary`. Without
     `SQL_LOG_BIN=0`: the replay reaches the binlog, hence the replicas, with
     new GTIDs (the server may still hold the original ones and would skip them);
   - **MongoDB**: the archives, concatenated into a private temporary
     directory of the primary, `mongorestore --oplogReplay --oplogLimit <instant>:0`,
     then deleted. The chain starts slightly before the dump: replaying an
     entry twice is harmless.

**Stop every writer first**, the MySQL ones too (financial-scraper,
financial-scraper-collector): a row written between the dump restore and the
replay makes the replay fail on a duplicate key (exit 1, restore again once
stopped). The script stops the SPIRE server itself only for the CA keys:
with `--components mysql` alone, scale `spire-server` to 0 first.

The window is the last 72 h (archive retention). Before that, restore a
daily backup with `--timestamp`.

### Docker

```bash
bash scripts/restore.sh                                   # latest, all components
bash scripts/restore.sh --timestamp 2025-01-01_120000
bash scripts/restore.sh --components mongodb,mysql
bash scripts/restore.sh --dry-run
```

SPIRE: the server is stopped and its whole data directory (`data_*.tar`: CA
keys + SQLite datastore) is written back; backups taken before 2026-10-28 only
hold `keys_*.json` and restore the keys alone.

### SPIRE CA restore and SVIDs

Restoring the CA keys together with the datastore of the same backup brings
back the trust bundle unchanged: SVIDs issued before the incident stay valid.
SVIDs issued by a CA generated after the loss (between the incident and the
restore) are signed by a key no longer in the bundle: restart the
`spiffe-helper` sidecars, or wait for their rotation, if a workload rejects
peers after the restore. The CI drill checks that Prometheus scrapes every
target over mTLS after the restore.

## Disaster Recovery

### Failure Scenarios

| Scenario               | Impact           | Recovery Action                                  |
| ---------------------- | ---------------- | ------------------------------------------------ |
| Single container crash | Degraded service | Docker auto-restart / Kubernetes restart         |
| Node failure           | Degraded / outage | Replica sets and StatefulSets reschedule; restore if a volume is lost |
| Data corruption        | Data loss        | Stop the writers, restore from the latest backup |
| Full region failure    | Complete outage  | Redeploy the overlays in another region (single-region platform, see MULTI_REGION.md), restore from the off-site copy |
| Secrets leak           | Security breach  | Rotate all secrets, rotate SPIRE trust bundle / SVIDs |

### Recovery Steps for Total Outage

1. Provision replacement hosts, deploy the manifests from git (`deploy.yml`)
2. Fetch the latest encrypted backups from the off-site bucket
3. Restore the databases: MongoDB → MySQL (incl. SPIRE `spire`)
4. Restore the SPIRE CA keys (`keys.json`), which restarts the SPIRE server
5. Restore the trainer checkpoints
6. Verify health endpoints, service registration in discovery-server and the
   Prometheus targets (all `up` means mTLS works)

### Recovery Verification

```bash
# Check all services are registered (through edge-proxy → gateway)
curl -s http://localhost:8449/v1/discovery-server/services -H "x-api-key: <AUTH_TOKENS value>"

# Check core service health (mTLS via SPIRE SVIDs, run inside a service container)
for svc in discovery-server message-manager api-gateway; do
  docker compose exec -T "$svc" sh -c \
    'curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem https://localhost:3000/ping'
done
```

## Backup Verification (CI/CD)

| Where | What |
| ----- | ---- |
| `ci.yml`, job `k8s` (every push to main/development and every PR) | Staging overlay on kind: drill markers seeded, real audit chain recorded, a dead letter stored the way message-manager stores them (`tests/k8s/dlq-seed.cjs`: signed `POST /dlq` over mTLS), `db-backup` run (age key generated for the run, off-site copy to an in-cluster S3), then markers, audit events and a dead letter written **after** the dump, writers stopped (audit-logger, dlq-service, financial-scraper, financial-scraper-collector), the instant recorded, one more marker after it, `db-backup-incremental` run (archives encrypted, off-site, an instant past them refused by `restore-k8s.sh --until`), data destroyed (`audit` and `dlq` databases, markers, `market_candles`, SPIRE server volume), `restore-k8s.sh --until <instant>`, checks: the audit chain exactly as at the instant (events written after the dump included, same hashes, chain verified by `tests/backup/audit-chain.js`), every dead letter of the instant back, markers 1-4 and not 5 in both MongoDB replica sets and MySQL, `market_candles` back, SPIRE trust bundle identical, audit-logger extends the restored chain once restarted, every Prometheus target up over mTLS |
| `backup-test.yml` (weekly, on changes to the scripts) | Library tests (`tests/backup/backup-encryption.test.sh`, `tests/backup/pitr-chain.test.sh`: archive chains, gaps refused, no partial file, incremental metrics), then the Docker drill: an audit trail written by the audit-logger image code (`tests/backup/seed-audit-chain.cjs`, events in the pre-2026-10-31 format, then current ones), MongoDB (3 databases), MySQL, Redis and the SPIRE server backed up, containers and volumes deleted, restored, checked (same audit events and hashes, chain verified, SPIRE trust bundle identical) |

## Known Limits

- **RPO 1 h, not continuous** (ADR-0031): writes since the last hourly
  archive are lost with the volume. Point in time only over the last 72 h;
  older restores are day by day. The SPIRE CA keys (`keys.json`) stay daily.
- **Point-in-time in Kubernetes only**: the Docker scripts restore the daily
  dump (no binlog or oplog archive; compose MongoDB is not a replica set).
- **After a point-in-time restore onto a new MySQL volume**, the server has a
  new uuid: its binlogs go to a new directory, and the next point-in-time
  restore needs the next daily dump. Run `db-backup` by hand after such a
  restore to shorten that window.
- **DDL between the dump and the instant** (a migration) replays as is: a
  statement the restored schema rejects stops the replay with exit 1.
- **Docker stack**: no scheduler, no backup metrics scraped, Redis without
  persistence (derived state only). Compose is a development stack.
- **No business-level validation after a restore** beyond the CI drill: check
  the latest `market_candles` by hand after a real restore. The audit trail
  can be checked: `mongosh --eval "const AUDIT_DB = 'audit'; $(cat tests/backup/audit-chain.js)"`
  on the audit primary (`broken` must be `null`). Events stored before
  2026-10-31 hold `correlationId: null` where their hash saw no field; the
  verifier drops that null (audit-logger never hashes one), so they verify too.

## Ownership

- Backup automation: DevOps / Platform team
- Restore procedure validation: CI (every run) + SRE review (quarterly)
- Secrets rotation: Security team (quarterly)
- DR drill coordination: Engineering manager (bi-annual)
