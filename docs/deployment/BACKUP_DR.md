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
>   server volume) and restores it as after the loss of the cluster: the run
>   is fetched from the off-site bucket with `scripts/fetch-offsite.sh` into a
>   pod that never mounts `backup-data`, then restored with
>   `scripts/restore-k8s.sh` (`tests/k8s/run-kind.sh`, `verify_backup`). The audit trail written by
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
| MongoDB `mongo-audit`         | audit-logger                                  | Critical    | 24 h (daily dump)      | 4 hours    |
| MongoDB `mongo-dlq`           | dlq-service                                   | High        | 24 h (daily dump)      | 4 hours    |
| MySQL `financial_scraper`     | financial-scraper                             | High        | 24 h (daily dump)      | 4 hours    |
| MySQL `spire` + `keys.json`   | SPIRE Server (datastore + CA private keys)    | Critical    | 24 h (daily backup)    | 4 hours    |
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
2:00 AM with the `backup-tools` image (`deploy/backup`: kubectl, age, rclone)
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

### Run manifest

A dump that fails half-way is still a valid `age` file (age encrypts whatever
it receives and closes the stream cleanly), and its name looks like any other
dump. So the backup scripts (`write_dump` in `scripts/backup-lib.sh`):

- write every dump to `<file>.partial` and rename it only when every stage of
  the pipeline succeeded and the plaintext is not empty; otherwise the partial
  file is deleted. A run killed mid-dump (OOM, `activeDeadlineSeconds`) can
  leave a `.partial`: `prune_old` deletes those older than an hour. A
  `.partial` file is never read by a restore;
- compute the sha256 of the **plaintext** on the fly (`tee` into
  `sha256sum`), with no plaintext on disk;
- write, at the end of the run, `manifests/manifest_<TIMESTAMP>.json` (sealed
  with age like the dumps, `.json.age`; written to `.partial` then renamed)
  listing the dumps that succeeded, and copy it off-site with them. A run
  where nothing succeeded writes no manifest. A manifest that cannot be
  written fails the run (`backup_last_status{component="manifest"} 0`).

```json
{"version":1,"timestamp":"2026-11-01_020000","entries":[
{"component":"mongodb","path":"mongodb/2026-11-01_020000/mongodb.archive.gz.age","size":18734,"sha256":"…"},
{"component":"mysql","path":"mysql/financial_scraper_2026-11-01_020000.sql.gz.age","size":90412,"sha256":"…"}
]}
```

`component` is the restore unit: `mongodb`, `mongodb-audit`, `mysql`,
`checkpoints`, `spire` (Kubernetes); `mongodb`, `mysql`, `redis:<container>`,
`checkpoints`, `spire` (Docker). `path` is relative to `BACKUP_DIR`, `size` is
the size of the file on disk (encrypted), `sha256` the checksum of its
decrypted content. One entry per line: the restore scripts read it without
`jq`.

**Selection rule** (`resolve_backup`, both restore scripts):

| Invocation | Backup restored for each requested component |
| ---------- | -------------------------------------------- |
| no `--timestamp` (`latest`) | the newest run whose manifest lists the component; a run whose listed file is gone is skipped with a warning. Files without manifest are never picked: with no manifest at all the restore refuses and asks for `--timestamp` |
| `--timestamp <ts>`, run with manifest | that run; refused (exit 1) when its manifest does not list the component |
| `--timestamp <ts>`, run without manifest (taken before 2026-11) | the file of that run, with a warning: no checksum to verify |

Before anything is written (and also with `--dry-run`), every file is checked
against its manifest entry: size, then sha256 of the decrypted content; a
mismatch is refused. A MySQL dump is also refused when its last non-empty
line is not mysqldump's closing `-- Dump completed on …` (any run, with or
without manifest). Reading the manifests needs `BACKUP_AGE_IDENTITY`, dry
runs included. A refused component counts as a failed step (exit 1); the
other components are still restored.

A manifest that cannot be read (`BACKUP_AGE_IDENTITY` unset, not a readable
file or not the right key, corrupt file) refuses the component with an
explicit `✗` message and exit 1: it is never skipped, and `latest` never falls
back to an older run past it. When the newest manifest is corrupt, restore an
older run with `--timestamp <ts>` of that run.

### Off-site Storage (mandatory in Kubernetes)

`BACKUP_S3_BUCKET` copies each run's encrypted files (dumps that succeeded and
the run manifest) to any S3-compatible store
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

- `backup-data` volume: 30 days (`RETENTION_DAYS`, dumps and run manifests
  pruned by `prune_old`, which also deletes `.partial` files older than an hour)
- Off-site: the bucket's lifecycle rule

## Monitoring

`backup-k8s.sh` writes `/backups/metrics/backup.prom`, served by
`backup-metrics-exporter` and scraped by Prometheus (job `backup-metrics`).

| Alert                     | Fires when                                                                   |
| ------------------------- | ---------------------------------------------------------------------------- |
| `BackupFailed`            | a component's last success is older than 25 h                                |
| `BackupNotRunning`        | a component never succeeded                                                  |
| `BackupComponentMissing`  | a component (mongodb, mongodb-audit, mysql, spire, checkpoints) reports nothing |
| `BackupJobStale`          | the job has not run for 26 h                                                 |
| `BackupMetricsAbsent`     | no backup metric at all (job never ran, exporter down)                       |
| `BackupUnencrypted`       | no age recipient                                                             |
| `BackupOffsiteCopyFailed` | the off-site copy failed or is not configured                                |

## Restore Procedures

Encrypted backups (`*.age`) need the age private key:
`BACKUP_AGE_IDENTITY=~/backup-key.txt` in front of any restore command below.
Manual decryption: `age -d -i backup-key.txt <file>.age`.

Without `--timestamp`, each component comes from the last run that backed it
up successfully according to its manifest, after a checksum check
([Run manifest](#run-manifest)). Backups taken before run manifests are
restored with an explicit `--timestamp`.

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

### From the off-site bucket

When `backup-data` is lost (cluster gone, volume destroyed), the bucket holds
the only copy. `scripts/fetch-offsite.sh` copies one run, still encrypted,
into an empty directory in the layout `restore-k8s.sh` reads. Without
`--timestamp` it takes the newest run holding every file of the requested
components: `upload_offsite` only copies the dumps that succeeded, so a run
missing a file (`mongodb/<TS>/mongodb.archive.gz.age` and
`mongodb-audit.archive.gz.age`, `mysql/financial_scraper_<TS>.sql.gz.age`,
`checkpoints/checkpoints_<TS>.tar.gz.age`, `spire/keys_<TS>.json.age`) is
skipped, and refused with `--timestamp`. The run manifest
(`manifests/manifest_<TS>.json.age`, see "Run manifest") is fetched with the
dumps, so `restore-k8s.sh` verifies each file against it; a run taken before
manifests is fetched with a warning and restored without checksum. It exits 1
when the bucket is unreachable or holds no complete run, and prints the
restore command.

```bash
# Same variables as the db-backup CronJob (Secret trading-model-backup-s3)
export BACKUP_S3_BUCKET=s3://bucket/prefix AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=...
export RCLONE_S3_ENDPOINT=https://s3.example.net RCLONE_S3_PROVIDER=Other   # non-AWS store only
bash scripts/fetch-offsite.sh --dry-run                 # runs in the bucket, complete or not
bash scripts/fetch-offsite.sh --dest ./restore          # newest complete run
bash scripts/fetch-offsite.sh --dest ./restore --timestamp 2026-10-01_020000 --components mongodb,mysql
BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
  bash scripts/restore-k8s.sh --timestamp <TS printed by fetch-offsite.sh>
```

Inside the new cluster, the `backup-scripts` ConfigMap carries
`fetch-offsite.sh`: run it in a `backup-tools` pod with the
`trading-model-backup-s3` variables and an `emptyDir` as destination, then
`restore-k8s.sh` with `BACKUP_DIR` on that directory (what
`tests/k8s/restore-runner.yaml` does in the CI drill). Nothing is decrypted
before `restore-k8s.sh`, which streams each file through `age -d`.

What `restore-k8s.sh` does:

- **MongoDB**: finds the writable primary of each replica set and runs
  `mongorestore --drop --oplogReplay` there (secondaries follow).
- **MySQL**: pipes the dump (GTID statements filtered) into the pod behind
  `mysql-primary`, with the container's own root password.
- **SPIRE**: scales `spire-server` to 0, writes `keys.json` into its volume
  from a helper pod (`RESTORE_HELPER_IMAGE`, default `backup-tools`) running as
  the server's user, scales it back and checks `spire-server healthcheck`.

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
2. Fetch the newest complete run from the off-site bucket, still encrypted:
   `bash scripts/fetch-offsite.sh --dest ./restore` (credentials and options
   in [From the off-site bucket](#from-the-off-site-bucket)); it prints the
   `restore-k8s.sh` command for the steps below (`BACKUP_DIR=./restore`,
   `--timestamp` of the fetched run). The CI drill logs how long the fetch
   and the restore took
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
| `ci.yml`, job `k8s` (every push to main/development and every PR) | Staging overlay on kind: drill markers seeded, real audit chain recorded, a dead letter stored the way message-manager stores them (`tests/k8s/dlq-seed.cjs`: signed `POST /dlq` over mTLS), `db-backup` run (age key generated for the run, off-site copy to an in-cluster S3), audit-logger and dlq-service stopped, data destroyed (`audit` and `dlq` databases, markers, `market_candles`, SPIRE server volume), the run fetched from the in-cluster S3 by `fetch-offsite.sh` into a pod without `backup-data` (fetch and restore durations logged), `restore-k8s.sh` on it, checks: every recorded audit event back with the same hashes and the chain verified (`tests/backup/audit-chain.js`), every recorded dead letter back, markers in both MongoDB replica sets and MySQL, `market_candles` back, SPIRE trust bundle identical, audit-logger extends the restored chain once restarted, every Prometheus target up over mTLS |
| `backup-test.yml` (weekly, on changes to the scripts) | Library tests (`tests/backup/backup-encryption.test.sh`; `tests/backup/backup-partial.test.sh`: a failed dump leaves no file, the manifest lists the successful dumps, `latest` skips a newer failed run, sha256 / size mismatch and a MySQL dump without `-- Dump completed` are refused, an unreadable manifest (no or wrong key, corrupt file) fails the restore, older backups only with `--timestamp`), off-site fetch tests (`tests/backup/fetch-offsite.test.sh` in the `backup-tools` image: runs uploaded by `upload_offsite` to `rclone serve s3`, newest complete run chosen over a newer incomplete one, its run manifest fetched with it, `--timestamp`, `--components`, `--dry-run`, layout read by `restore-k8s.sh`, files still encrypted, exit 1 on an incomplete or absent run, an empty or unreachable bucket, a non-empty destination), then the Docker drill: an audit trail written by the audit-logger image code (`tests/backup/seed-audit-chain.cjs`, events in the pre-2026-10-31 format, then current ones), MongoDB (3 databases), MySQL, Redis and the SPIRE server backed up, containers and volumes deleted, restored, checked (same audit events and hashes, chain verified, SPIRE trust bundle identical) |

## Known Limits

- **No point-in-time recovery between dumps**: binlogs are not archived, the
  MongoDB oplog is only captured during the dump. RPO is 24 h.
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
