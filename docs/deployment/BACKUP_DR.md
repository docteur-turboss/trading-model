# Backup & Disaster Recovery

## Overview

This document defines the backup strategy, disaster recovery procedures, and
restore verification for the trading-model platform.

> **Status (2026-10-28):** a backup counts only once it has been restored.
> Both sets of scripts are restored for real by CI:
>
> - Kubernetes: the CI `k8s` job (pull requests touching databases, backups or their services, and releases) backs up with the `db-backup`
>   CronJob, writes more data, stops the writers, archives binlogs and oplogs
>   with `db-backup-incremental`, destroys data (the real `audit` and
>   `dlq` databases, drill markers, the `market_candles` table, the SPIRE
>   server volume) and restores it as after the loss of the cluster: the run
>   and its archives are fetched from the off-site bucket with
>   `scripts/fetch-offsite.sh --pitr` into a pod that never mounts
>   `backup-data`, then restored up to a recorded instant with
>   `scripts/restore-k8s.sh --until` (`tests/k8s/run-kind.sh`, `verify_backup`). The audit trail written by
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
| SPIRE `datastore.sqlite3` + `keys-sqlite.json` | SPIRE Server (datastore and CA private keys, SQLite on its own volume, ADR-0065) | Critical | 24 h (daily backup: one tar, no journal) | 2 hours (SVIDs stay valid about 2 h after the server stops: TTL 4 h) |
| Trained agents                | trader-trainer (checkpoint files)             | Medium      | 24 h (daily tar)       | 1 hour     |
| SealedSecrets controller keys | Sealed Secrets controller (namespace `sealed-secrets`, ADR-0035): decrypts every SealedSecret of `deploy/k8s/secrets/` | Critical | Daily run of `scripts/backup-sealed-secrets-key.sh` by `sealed-secrets-key-backup.yml` (ADR-0035), plus a manual run after a manual key change ([sealed-secrets.md](sealed-secrets.md#back-up-the-controller-keys)): a renewed key is off-site within 24 h | 1 hour |
| Redis                         | message-manager journal (ADR-0048), discovery-server, dlq-service, readiness | High (journal), Low (rest) | Not backed up: journal protected by AOF and replication only | Journal not rebuildable; rest rebuilt |
| Loki (access and operational logs) | edge-proxy, Promtail-collected services (K8s `deploy/k8s/infra/loki.yaml`, 10Gi; Compose `loki-data`) | Low (security evidence kept 31 days) | Not backed up | Rebuilt |
| Prometheus TSDB               | Prometheus (K8s `deploy/k8s/infra/prometheus.yaml`, 50Gi; Compose `prometheus-data`) | Low | Not backed up | Rebuilt |
| Grafana (dashboards, datasources, local DB) | Grafana (K8s `deploy/k8s/infra/grafana.yaml`, 10Gi; Compose `grafana-data`) | Low | Not backed up | Rebuilt |

The RTO above is the **data-store RTO**: the time to rebuild the data from
backups after the store is lost. The service-tier RTO of the
[Business Continuity Policy](../compliance/business-continuity-policy.md)
(§ 2.2: T1 15 minutes, T2 1 hour) is the time to restart a service whose data
is intact; the policy explains the two side by side. Exercises and drill
timings are recorded in the [DR Exercise Log](../compliance/dr-exercise-log.md).

Redis holds two kinds of state. Derived state: instance registrations and
tokens (services register again), the DLQ retry queue (rebuilt from MongoDB by
dlq-service) and readiness keys; a day-old snapshot would restore stale
entries, so Redis is not backed up in Kubernetes. The message-manager journal
(ADR-0048) is not derived: it holds accepted (202) messages not yet delivered,
up to 24 h per stopped subscriber. **Journal RPO:** AOF plus replication
(`JOURNAL_MIN_REPLICAS=1` in production); losing the master and all replicas
loses those messages. No alert fires on a total loss (`JournalEntriesTrimmed`
only counts the 24 h trim): republish from the publishers' sources. The Docker scripts still
dump it (single node). With `REDIS_APPENDONLY=yes` Redis starts from its
append-only file and would ignore a restored `dump.rdb`: `scripts/restore.sh`
loads the snapshot in a throwaway server on the same volume and rewrites the
AOF from it before starting Redis again.

The observability stores are not backed up either, and this is a deliberate
choice, not an oversight. Logs and metrics are operational data kept for a
short window: Loki keeps access and operational logs for 31 days
(`retention_period: 744h`, [data retention policy](../compliance/data-retention-policy.md)),
Prometheus keeps metrics for 30 days (`--storage.tsdb.retention.time=30d`).
A backup would hold no more than the window itself, and the monitoring
platform is not on the path to restoring the trading data. The loss in a
disaster is therefore the log and metric history of the last 30 days, and
the dashboards are rebuilt from git: the Grafana provisioning
(`observability/grafana-dashboards-provisioning.yml`, Kubernetes
`deploy/k8s/infra/dashboards/`) loads the JSON dashboards in
`observability/dashboards/`. What is lost is state created in the Grafana UI
(its local database on `grafana-data`: user accounts, UI-only edits, annotations).
Alerts are not affected: the rules live in `observability/alerting.yml`,
and Alertmanager receives them again once Prometheus restarts.
Known gap: the Kubernetes Loki ConfigMap (`deploy/k8s/infra/loki.yaml`) sets no
`retention_period`, so the 31-day window above is enforced only by the Compose
configuration (`observability/loki-config.yml`).

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
(`financial_scraper`) and both MongoDB replica sets. The SPIRE datastore is
not in MySQL since ADR-0065: daily only.

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
  The oplog's oldest entry is read again after each archive: if the ring
  turned while it was being dumped, the archive is discarded (the next run
  reports the gap).
- The runs after a gap succeed again, so every run also publishes
  `backup_pitr_gap{component=…,run="incremental"}`, computed from the archive
  names: 1 while the chain has a break after the newest daily dump of that
  store (no restore `--until` past the break), back to 0 at the first run after
  the next daily dump. Alert `BackupPitrGap` (see [Point-in-time chain
  broken](#point-in-time-chain-broken)).
- Every run copies off-site every archive still on the volume, not only its
  own (`record_incremental_archives`; rclone skips those already there): a
  copy that failed one hour is caught up the next, so the off-site chain has
  no hole once `BackupOffsiteCopyFailed` resolves.

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

Docker has no scheduler: schedule `backup.sh` with the host's cron (Windows:
Task Scheduler running Git Bash with `MSYS_NO_PATHCONV=1`) if a compose stack
holds data that matters. Set `BACKUP_DIR` in `.env` to the same directory and
run with `METRICS_FILE=$BACKUP_DIR/metrics/backup.prom`: the compose service
`backup-metrics-exporter` serves it to Prometheus (job `backup-metrics`), so the
daily backup alerts apply. Compose has no point-in-time recovery (no
incremental job, standalone mongod): `backup.sh` reports
`backup_pitr_supported 0`, which keeps `BackupIncrementalMissing` quiet, and
reports `mongodb-audit` from the single mongod dump that holds it.

### Components Backed Up

| Component                                  | Method                                                         | Consistency                       |
| ------------------------------------------ | -------------------------------------------------------------- | --------------------------------- |
| MongoDB dlq and audit (one dump per replica set, from its primary) | `mongodump --gzip --oplog --archive`   | Point-in-time (end of the dump)   |
| MongoDB (Docker: message-manager, audit-logger, dlq) | `mongodump --gzip --archive` (standalone)            | Per collection                    |
| MySQL, every non-system database (`financial_scraper`; `spire` of the releases before ADR-0065) | `mysqldump --databases … --single-transaction --set-gtid-purged=OFF` | Transaction-consistent snapshot |
| Trainer checkpoints                        | `tar czf` of `/data/checkpoints/`                              | Filesystem snapshot               |
| SPIRE server, K8s (`datastore.sqlite3`, `keys-sqlite.json`) | through the `spire-entries` sidecar: `sqlite3 .backup` of the datastore, then the key file, in one tar (`spire/data_<TS>.tar`) | Online snapshot, server not paused (ADR-0065) |
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

**Why one run (issue #330).** A night where one component fails must not mix it with the others of another night. It was found with SPIRE when its datastore was in MySQL: `keys.json` of day J with the `spire` database (inside the MySQL dump) of day J-1. Since ADR-0065 the SPIRE datastore and keys are one file, the rule stays for the other components. `tests/backup/backup-partial.test.sh` reproduces it: both components come from J-1.

**SPIRE on Kubernetes, keys against the datastore (ADR-0065).** `backup-k8s.sh` snapshots the SQLite datastore (bundle, CA journal, entries) with `sqlite3 .backup` in the `spire-entries` sidecar, then reads `keys-sqlite.json`, and streams both as one tar, without pausing the server. SPIRE writes a new CA key to the key file before recording it in the journal, so a key file read after the snapshot always holds every key the journal refers to (at worst one more, unused). The server is not paused: a pause would drop SVID issuance and rotation for every workload. The snapshot sits in the sidecar's memory `emptyDir` until streamed. The SPIRE component no longer depends on the MySQL one: their order does not matter.

**Selection rule** (`select_common_run` then `resolve_backup`, both restore scripts):

| Invocation | Backup restored for each requested component |
| ---------- | -------------------------------------------- |
| no `--timestamp` (`latest`) | ONE run for all the requested components: the newest whose manifest lists every one of them (`mongodb` counts for both replica sets); its timestamp is printed. A run missing a component (that dump failed) or whose listed file is gone is skipped. No such run: exit 1, nothing touched. Files without manifest are never picked: with no manifest at all the restore refuses and asks for `--timestamp` |
| no `--timestamp`, `--allow-mixed-runs` | the previous rule, on purpose: each component from the newest run whose manifest lists it, one warning per component naming its run. components may then come from different nights: last resort only |
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
back to an older run past it. The same holds for a manifest that decrypts (or,
unencrypted, simply reads) but does not have the structure above: first line
`{"version":1,"timestamp":"…","entries":[`, one entry per line in the format
above, last non-empty line `]}`, every `path` relative and inside `BACKUP_DIR`
(no leading `/`, no `..`). A truncated, hand-edited or future-version manifest
is reported as corrupt, not read as "this run did not back it up". When the newest manifest is corrupt, restore an
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
SealedSecret) is kept. The bucket must have Object Lock in compliance mode
and the credentials no delete right ([Off-site
immutability](#off-site-immutability)): production deploys refuse a bucket
without it. The job only adds files, retention off-site is the bucket's
lifecycle rules ([Off-site tiers](#off-site-tiers)).

### Off-site immutability

The cluster holds the bucket's credentials: whoever takes the namespace (or a
ransomware running there) could otherwise delete the data **and** its
off-site copies. So (ADR-0033, issue #326):

1. **Object Lock, compliance mode, default retention 30 or 31 days.** Every
   file the job uploads is locked from its upload: in compliance mode nobody,
   not even the account owner, can delete or overwrite that version before
   the date. The default retention must be at least `RETENTION_DAYS` (30, the
   daily backups a restore relies on) and at most the 31 days of the
   `daily/` lifecycle rule: longer, the daily copies of the DLQ, checkpoints
   and SPIRE CA keys would outlive their retention (ADR-0032, data
   minimisation), and the lifecycle rules could not expire them on time.
   Weekly and monthly copies are locked their first 30 days, then expire by
   their lifecycle rules (85 and 1830 days). Governance mode is refused:
   anyone granted `s3:BypassGovernanceRetention` can delete through it.
2. **Credentials without delete right.** The job puts, lists and gets; it
   never deletes, and rclone `copy --s3-no-check-bucket` never deletes nor
   creates the bucket (a file whose modification time changed is updated by a
   server-side copy onto itself: a new version, allowed by Object Lock).
   Policy for `BACKUP_S3_BUCKET=s3://trading-backups/prod` (AWS; same actions
   on MinIO and most S3-compatible stores):

   ```json
   {"Version": "2012-10-17", "Statement": [
     {"Sid": "Write", "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::trading-backups/prod/*"},
     {"Sid": "ListAndCheck", "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketObjectLockConfiguration", "s3:GetLifecycleConfiguration"],
      "Resource": "arn:aws:s3:::trading-backups"},
     {"Sid": "NeverDelete", "Effect": "Deny",
      "Action": ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutBucketObjectLockConfiguration",
                 "s3:PutObjectRetention", "s3:PutObjectLegalHold", "s3:BypassGovernanceRetention",
                 "s3:PutLifecycleConfiguration", "s3:PutBucketVersioning", "s3:PutBucketPolicy", "s3:DeleteBucket"],
      "Resource": ["arn:aws:s3:::trading-backups", "arn:aws:s3:::trading-backups/*"]}
   ]}
   ```

   `s3:GetBucketObjectLockConfiguration` is for the deploy check below,
   `s3:GetLifecycleConfiguration` for `check_offsite_lifecycle`. Bucket
   settings (Object Lock, lifecycle rules) are changed with other, admin
   credentials, never stored in the cluster nor in the GitHub environment.
   Restores (`fetch-offsite.sh`) only need `s3:ListBucket` and
   `s3:GetObject`.
3. **Set up at creation.** Object Lock needs versioning, and is enabled when
   the bucket is created (`--object-lock-enabled-for-bucket`; MinIO
   `mc mb --with-lock`). AWS can also enable it on an existing versioned
   bucket; most other providers cannot, so create a new bucket there:

   ```bash
   aws s3api create-bucket --bucket trading-backups --object-lock-enabled-for-bucket \
     --create-bucket-configuration LocationConstraint=eu-west-3   # add --endpoint-url for MinIO, Scaleway, OVH...
   aws s3api put-object-lock-configuration --bucket trading-backups --object-lock-configuration \
     '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":30}}}'
   aws s3api get-object-lock-configuration --bucket trading-backups
   ```

   A compliance retention cannot be shortened, nor the objects deleted before
   it ends, even by the account owner: try the settings on a test bucket
   first.

**Deploy check.** `deploy.yml` runs `scripts/backup-bucket-check.sh` before
applying anything ("Check off-site backup bucket immutability"), with the
credentials the job will use: those of the GitHub environment
(`BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, secrets
`BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY`), or else, when
`BACKUP_S3_BUCKET` is unset, the bucket, endpoint and credentials of the
`trading-model-backup-s3` Secret already in the namespace (e.g. a
SealedSecret; the values are masked in the logs). It reads
`get-object-lock-configuration` and reports a problem when there is no bucket
at all, when the configuration cannot be read (no Object Lock, a provider
without Object Lock, credentials without
`s3:GetBucketObjectLockConfiguration`, store unreachable), without default
retention, in governance mode, or with a default retention outside
`RETENTION_DAYS` (read from the `db-backup` CronJob) to 31 days. In
`production` a problem is an `::error::` and the deploy stops before any
change; elsewhere it is a `::warning::`.

**Configuration present (issue #331).** Before the overlay, `deploy.yml`
(`scripts/backup-config-check.sh`, test `tests/backup/backup-config-check.test.sh`)
refuses a `production` deploy (`::error::`, exit 1) that has neither the
variable `BACKUP_AGE_RECIPIENTS` nor a `backup-encryption` ConfigMap in the
namespace, or neither `BACKUP_S3_BUCKET` nor a `trading-model-backup-s3`
Secret (e.g. a SealedSecret). A resource already in the cluster is enough;
other environments get a `::warning::`.

**Fallback.** The GitHub environment variable
`BACKUP_S3_IMMUTABILITY_CHECK=warn` turns the production error into a
warning while the bucket is being set up (the downgrade is itself reported
on every deploy); remove it once the check passes. `enforce` makes a staging
deploy fail too. There is no value that skips the check. Tested by
`tests/backup/backup-bucket-check.test.sh` (stub `aws` CLI; workflow
`backup-test.yml`).

**Region.** The same script reads the bucket's region
(`aws s3api get-bucket-location`; `null` is `us-east-1`, `EU` is
`eu-west-1`) and checks it against `BACKUP_S3_ALLOWED_REGIONS`
(GitHub environment variable, space-separated; default: EU regions of AWS,
Scaleway and OVH, `docs/deployment/ENV.md`). A region outside the list, or one
the store does not report (some S3-compatible stores), is an error in
production and a warning elsewhere. The audit-anchor bucket
(`AUDIT_ANCHOR_*`) has no such check yet: see
`docs/compliance/third-party-dpas.md`.

### Retention

Grandfather-father-son (ADR-0032), applied by `prune_old` and by the
off-site layout (`scripts/backup-lib.sh`):

| Tier | Run kept | Components | `backup-data` (CronJob) | Off-site |
| ---- | -------- | ---------- | ----------------------- | -------- |
| daily | every run | all | 30 days (`RETENTION_DAYS`) | `daily/`, 31 days |
| weekly | first complete run of each ISO week (Monday's, normally) | `mongodb-audit`, `mysql` | no (`RETENTION_WEEKLY_WEEKS=0`) | `weekly/`, 85 days (12 weeks) |
| monthly | first complete run of each calendar month | `mongodb-audit`, `mysql` | no (`RETENTION_MONTHLY_MONTHS=0`) | `monthly/`, 1830 days (60 months) |

- **Age** comes from the `%Y-%m-%d_%H%M%S` timestamp in the file name, never
  from the mtime (a copy or a fetch from the bucket changes it). A file
  without timestamp falls back to its mtime. `metrics/` is never touched,
  `.partial` files older than an hour are deleted, a `mongodb/<TS>/`
  directory goes once its archives are gone.
- **Complete run**: its run manifest exists and the component's final file
  exists ([Run manifest](#run-manifest)); no decryption needed. Only
  complete runs are promoted: a failed dump leaves no file, a run killed
  before its manifest has none. The *first* run of the week or month is
  promoted so that the decision is taken at upload time (whether a later
  run of the week will succeed is not known yet).
- **Guard**: the newest complete run of each component is never deleted,
  whatever its age (a component whose backups stopped keeps its last good
  one). A component with no complete run at all (backups taken before
  manifests) keeps its newest file.
- A manifest is kept as long as one of its dumps, and at least 30 days.
- Variables: `RETENTION_DAYS` (default 30), `RETENTION_WEEKLY_WEEKS` and
  `RETENTION_MONTHLY_MONTHS` (long tiers on the volume, default 0),
  `RETENTION_LONG_COMPONENTS` (manifest keys, default `mongodb-audit mysql`),
  `BACKUP_OFFSITE_LAYOUT` (`flat` by default, `tiered` in the CronJob).
  Without any of them the behaviour is the former one: 30 days, plus the
  guard. With `RETENTION_WEEKLY_WEEKS=12 RETENTION_MONTHLY_MONTHS=60` the same
  tiers are also kept on the volume (a Docker host with room for them; the
  100Gi `backup-data` PVC is sized for dailies only).
- `checkpoints`, the operational `mongodb` (DLQ, 30 days) and `spire/`
  (CA private keys, `keys_*` / `data_*`) are never promoted: data minimisation, see the
  [data retention policy](../compliance/data-retention-policy.md#backups-and-data-minimisation).

- Point-in-time archives: binlogs and oplog slices (`mysql/binlog/`,
  `mongodb/oplog/`) are kept 72 h (`INCREMENTAL_RETENTION_HOURS`, pruned by
  `backup-incremental-k8s.sh`, ADR-0031) and are outside the GFS: `prune_old`
  never lists them, and they are never promoted. Past 72 h only the daily
  dumps remain: point in time over the last 72 h, day by day before that.
  A run's `.pitr` file follows its dump on the volume but is never copied
  to `weekly/` or `monthly/` (useless without the binlogs, gone after 72 h).
  Off-site, give the prefixes `daily/mysql/binlog/` and `daily/mongodb/oplog/`
  (bucket root `mysql/binlog/`, `mongodb/oplog/` with the flat layout) a
  3-day expiry to match: the job does not delete off-site. Under Object Lock
  ([Off-site immutability](#off-site-immutability)) an archive stays locked
  30 days anyway: the rule hides it after 3 days, its version is deleted once
  the lock ends.

Tested by `tests/backup/backup-retention.test.sh` (400 days of fake runs,
exact set of kept files and of off-site copies; workflow `backup-test.yml`).

### Off-site tiers

With `BACKUP_OFFSITE_LAYOUT=tiered`, `upload_offsite` copies every file of a
run to `<BACKUP_S3_BUCKET>/daily/<path>`, and the promoted dumps, with their
run manifest, also to `weekly/<path>` and `monthly/<path>`: at most 3 copies
of a run. A dump of a long component is weekly (monthly) when the volume
holds no earlier complete run of it in the same ISO week (month); the daily
tier keeps those earlier runs (`RETENTION_DAYS` >= 30). Under each prefix
the layout is the volume's: `fetch-offsite.sh` reads `daily/` by default on a
tiered bucket, `--tier weekly` or `--tier monthly` another tier
(`--components mongodb-audit,mysql` there), and `--tier flat` the bucket root
([From the off-site bucket](#from-the-off-site-bucket)). The weekly and monthly
prefixes hold only `mongodb-audit`, the MySQL dump and the manifests: no
operational `mongodb`, no checkpoints, no CA keys, and no `.pitr` starting
point (useless once the binlogs and oplogs, kept 72 h, are gone). The
incremental job (`db-backup-incremental`) uses the tiered layout too: its
binlog and oplog archives go under `daily/` only, next to the dumps
`fetch-offsite.sh --pitr` reads with them.

**Catch-up of a failed promoted copy.** The tier of a run is decided when it
is uploaded, so a failed copy of the first run of a month would otherwise
leave that month without monthly copy once the local dump is pruned. Each
daily run therefore also sends again the weekly and monthly copies of every
week (month) that started at most `RETENTION_DAYS` days ago
(`offsite_catchup`; rclone skips the objects already in the bucket, the
`aws` fallback checks with `aws s3 ls` first). Once `BackupOffsiteCopyFailed`
resolves, the long tiers have no hole, provided the bucket came back within
`RETENTION_DAYS` (30) days of the failed run: past that, the first runs of the
period may be pruned, and that period's weekly or monthly copy stays missing.
To catch up by hand earlier, re-run the daily job
(`kubectl create job --from=cronjob/db-backup db-backup-manual`). The
incremental job does not catch up dumps (it writes no manifest).

The job never deletes in the bucket (its credentials need no delete right,
which keeps Object Lock possible): one lifecycle rule per prefix expires the
copies. For `BACKUP_S3_BUCKET=s3://trading-backups/prod` (the two archive
rules match the 72 h local window, ADR-0031; where rules overlap, S3 applies
the shortest expiry):

```json
{"Rules": [
  {"ID": "backup-daily",   "Status": "Enabled", "Filter": {"Prefix": "prod/daily/"},   "Expiration": {"Days": 31}},
  {"ID": "backup-binlog",  "Status": "Enabled", "Filter": {"Prefix": "prod/daily/mysql/binlog/"},  "Expiration": {"Days": 3}},
  {"ID": "backup-oplog",   "Status": "Enabled", "Filter": {"Prefix": "prod/daily/mongodb/oplog/"}, "Expiration": {"Days": 3}},
  {"ID": "backup-weekly",  "Status": "Enabled", "Filter": {"Prefix": "prod/weekly/"},  "Expiration": {"Days": 85}},
  {"ID": "backup-monthly", "Status": "Enabled", "Filter": {"Prefix": "prod/monthly/"}, "Expiration": {"Days": 1830}}
]}
```

```bash
aws s3api put-bucket-lifecycle-configuration --bucket trading-backups \
  --lifecycle-configuration file://lifecycle.json   # add --endpoint-url for MinIO, Scaleway, OVH...
aws s3api get-bucket-lifecycle-configuration --bucket trading-backups
```

With versioning on (always the case under Object Lock), an expiry only puts a
delete marker over the file: also expire noncurrent versions
(`"NoncurrentVersionExpiration": {"NoncurrentDays": 1}` in each rule, and
`"ExpiredObjectDeleteMarker": true` in a rule of its own), otherwise old
versions stay forever. A locked version is deleted only once its lock ends
(30 or 31 days after upload, [Off-site immutability](#off-site-immutability)). After
each tiered copy, `check_offsite_lifecycle` reads the bucket's rules when the
`aws` CLI is there and warns about a prefix without rule. The `backup-tools`
image has only rclone, which cannot read lifecycle rules: the CronJob logs
that they were not verified, so check them with the command above when the
bucket is set up (checklist below). The rules are the only expiry off-site:
a missing rule keeps copies forever, it never loses one.

**Deployment checklist (before the first tiered run, and after any change of
bucket):** create the bucket with Object Lock (compliance, 30 days) and give
the job credentials without delete right ([Off-site
immutability](#off-site-immutability)), set the five rules above, then read
them back with `aws s3api get-bucket-lifecycle-configuration`. In Kubernetes nothing else
checks them: `backup-tools` has no `aws` CLI, so every run only logs
"Off-site lifecycle rules not verified".

## Retention job

ADR-0051. Market data (`market_candles`, `market_trades`, `market_tickers`, `market_order_books`) and `signals` older than `RETENTION_DAYS` (default 1827, 5 years; `RETENTION_SIGNALS_DAYS` for `signals`, `RETENTION_ORDER_BOOKS_DAYS` for `market_order_books`: 180 in the CronJob) are deleted by `scripts/retention-mysql.sh`, in `DELETE ... LIMIT RETENTION_BATCH_SIZE` batches with a pause between them. A rerun deletes only what is still too old. Variables: [ENV.md](ENV.md#mysql-retention-job-adr-0051).

**Kubernetes.** CronJob `db-retention` (`deploy/k8s/jobs/retention-cronjob.yaml`), daily 03:30 UTC, image `backup-tools`, script from the `backup-scripts` ConfigMap. It connects as MySQL user `retention` (SELECT, DELETE on the five tables only), created and granted per table by `db-migrate-user` from `MYSQL_RETENTION_PASSWORD` in `trading-model-secrets`. `run-migrations.sh` runs that Job again after the migrations, so the grants exist on a new database.

- **Before the first production deploy (manual):** add `MYSQL_RETENTION_PASSWORD` to `deploy/k8s/secrets/trading-model-sealed-secrets.yaml` with every other key (see [sealed-secrets.md](sealed-secrets.md)). Without it the `retention` user is not created and `db-retention` fails (`RetentionFailed` / `RetentionStale`).
- Change the period: edit `RETENTION_DAYS` in the CronJob and deploy. Lowering it deletes the surplus at the next run: check the backups first (the GFS dumps keep 5 years, [Retention](#retention)).
- Run now: `kubectl -n trading-model create job retention-manual --from=cronjob/db-retention`, then `kubectl -n trading-model logs job/retention-manual`.
- Suspend: `kubectl -n trading-model patch cronjob db-retention -p '{"spec":{"suspend":true}}'` (`RetentionStale` fires after 36 h).

**Docker (compose).** No scheduler: schedule on the host, inside the MySQL container (it has the client), e.g. daily with cron:

```bash
docker exec -i -e MYSQL_USER=root -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" -e MYSQL_HOST=localhost   -e RETENTION_DAYS=1827 trading-mysql bash -s < scripts/retention-mysql.sh
```

Without `METRICS_FILE` it publishes no metric (the script runs in the container). Windows: Task Scheduler with Git Bash and `MSYS_NO_PATHCONV=1`.

**Metrics** (`/backups/metrics/retention.prom`, served by `backup-metrics-exporter`): `retention_last_run_rows_deleted{table}`, `retention_last_success_timestamp` (kept on failure), `retention_last_status` (1 ok, 0 a table failed), `retention_last_run_duration_seconds`.

**Runbook.**
- `RetentionFailed`: `kubectl -n trading-model logs job/<db-retention-...>`: the line `ERROR <table>` names the table. Usual causes: MySQL down or read-only (group replication failover), `retention` user missing (`MYSQL_RETENTION_PASSWORD` absent: add it, rerun `db-migrate-user`), lock wait timeout (lower `RETENTION_BATCH_SIZE`). The next run resumes; nothing is lost.
- `RetentionStale`: `kubectl -n trading-model get cronjob db-retention` (suspended? last schedule?) and the job's pods (image pull, Secret key missing).
- The deletes go through the binlogs (PITR, [ADR-0031](../adr/0031-point-in-time-recovery-hourly-archives.md)): a restore `--until` an instant replays them. The first purge of a large backlog writes a lot of binlog: watch `BackupVolumeFilling`.

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
| `BackupIncrementalFailed` | the last hourly run of a binlog / oplog failed (warning; the next run retries) |
| `BackupPitrGap`           | a binlog / oplog chain has a break after the newest daily dump: no `--until` past it, until the next daily dump (stays firing while the runs succeed again) |
| `BackupMetricsAbsent`     | no metric of the daily job (`run=""`: the incremental job's series do not count; job never ran, exporter down) |
| `BackupUnencrypted`       | no age recipient                                                             |
| `BackupOffsiteCopyFailed` | the off-site copy failed or is not configured (the next daily run sends the missed weekly / monthly copies again: [catch-up](#off-site-tiers); fix within 30 days) |
| `RetentionFailed`         | the last `db-retention` run failed on a table ([Retention job](#retention-job); warning) |
| `RetentionStale`          | no successful `db-retention` run for 36 h (daily job) |
| `BackupVolumeFilling`     | the `backup-data` volume is more than 80 % full for 30 min (`backup_volume_used_ratio`, measured with `df` by both jobs; independent of kubelet volume metrics) |

### Storage class of `backup-data`

The PVC sets no `storageClassName`: it uses the cluster default class. To pin
another class for a new deployment, patch it in the overlay
(`op: add`, `path: /spec/storageClassName`, target `PersistentVolumeClaim`
`backup-data`). `storageClassName` of an existing PVC is immutable: a change
only applies to a new cluster, or after recreating the claim (restore the
backups from the off-site copy first).

### Rows past their retention after a restore

`restore-k8s.sh` runs the `db-retention` CronJob once (`kubectl create job db-retention-post-restore-<stamp> --from=cronjob/db-retention`) after a successful MySQL restore, full or `--until`, and waits for it (`RETENTION_WAIT`, default `4h`, like the CronJob's deadline). If the Job fails, the restore exits 1 and prints the Job's last log lines: run the purge again. `--no-retention` skips it (forensic analysis of a past state): the expired rows then stay until the next daily run. The CI `k8s` drill restores a ticker 2000 days old and checks it is gone.

Limit: the compose `scripts/restore.sh` does not run it (no `db-retention` job in compose, where no purge runs at all); purge by hand after a compose restore.

MongoDB: `mongorestore` runs without `--noIndexRestore`, so the TTL indexes of `audit_events` and the DLQ come back with the data and the TTL monitor purges expired documents on its own (it wakes every 60 s). This is read from the code (`audit-repository.ts`, `index-manager.ts`) and has not been measured on a live restore: no drill asserts it yet.

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
and start the SPIRE server, create a helper pod. SPIRE (datastore and CA
keys, ADR-0065) no longer depends on MySQL: any order.

From a workstation, with the backup files copied locally:

```bash
BACKUP_DIR=./backups K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
  bash scripts/restore-k8s.sh                      # mongodb,mysql,checkpoints,spire
bash scripts/restore-k8s.sh --timestamp 2026-10-01_020000 --components mongodb
```

Or inside the cluster, next to the `backup-data` volume: a pod running
`backup-tools` with the `backup-scripts` ConfigMap at `/scripts`,
`backup-data` at `/backups` (the default `BACKUP_DIR`) and a service account
with namespace admin rights, the private key passed on stdin. No manifest ships
for this case: `tests/k8s/restore-runner.yaml` no longer mounts `backup-data`
(it restores from the off-site bucket, see the next section), and
`backup-inspector` in the same file mounts it read-only, without a service
account, to check what the CronJob wrote.

```bash
kubectl exec -i -n trading-model <restore-pod> -- sh -c \
  'umask 077 && cat > /tmp/id && BACKUP_AGE_IDENTITY=/tmp/id K8S_NAMESPACE=trading-model \
   bash /scripts/restore-k8s.sh; rc=$?; rm -f /tmp/id; exit $rc' < ~/backup-key.txt
```

### From the off-site bucket

When `backup-data` is lost (cluster gone, volume destroyed), the bucket holds
the only copy. `scripts/fetch-offsite.sh` copies one run, still encrypted,
into an empty directory in the layout `restore-k8s.sh` reads. Without
`--timestamp` it takes the newest run holding every file of the requested
components and its run manifest: `upload_offsite` only copies the dumps that
succeeded, so a run missing a file (`mongodb/<TS>/mongodb.archive.gz.age` and
`mongodb-audit.archive.gz.age`, `mysql/financial_scraper_<TS>.sql.gz.age`,
`checkpoints/checkpoints_<TS>.tar.gz.age`, `spire/data_<TS>.tar.age`
(`spire/keys_<TS>.json.age` before ADR-0065),
`manifests/manifest_<TS>.json.age`) is skipped, and refused with `--timestamp`
when a dump is missing. The manifest comes with the run: `restore-k8s.sh`
checks every file against it (size, sha256, see [Run manifest](#run-manifest)).
A run taken before manifests is only fetched with `--timestamp`, and restored
without checksum. It exits 1 when the bucket is unreachable or holds no
complete run, and prints the restore command.

With `--pitr` (point-in-time restore, see below) the run must also hold its
`.pitr` starting points, and the binlog / oplog archives that can follow it
come too (`mysql/binlog/<server>/` archived at or after the run,
`mongodb/oplog/<replica set>/` ending at or after it); `restore-k8s.sh
--until` then picks the chain. For an instant older than the newest run,
add `--timestamp` with the newest run taken before that instant.

```bash
# Same variables as the db-backup CronJob (Secret trading-model-backup-s3)
export BACKUP_S3_BUCKET=s3://bucket/prefix AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=...
export RCLONE_S3_ENDPOINT=https://s3.example.net RCLONE_S3_PROVIDER=Other   # non-AWS store only
bash scripts/fetch-offsite.sh --dry-run                 # runs in the bucket, complete or not
bash scripts/fetch-offsite.sh --dest ./restore          # newest complete run
bash scripts/fetch-offsite.sh --dest ./restore --timestamp 2026-10-01_020000 --components mongodb,mysql
BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
  bash scripts/restore-k8s.sh --timestamp <TS printed by fetch-offsite.sh>
# Long tiers of a tiered bucket (ADR-0032): audit trail and market data only
bash scripts/fetch-offsite.sh --dest ./restore --tier monthly --components mongodb-audit,mysql
bash scripts/fetch-offsite.sh --dest ./restore --tier monthly --components mongodb-audit --timestamp 2025-09-01_020000
BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
  bash scripts/restore-k8s.sh --timestamp <TS> --components mongodb-audit   # audit replica set alone
# Point-in-time: the run and the archives after it
bash scripts/fetch-offsite.sh --dest ./restore --pitr
BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt \
  bash scripts/restore-k8s.sh --until 2026-11-03T13:45:00Z
```

Inside the new cluster, the `backup-scripts` ConfigMap carries
`fetch-offsite.sh`: run it in a `backup-tools` pod with the
`trading-model-backup-s3` variables and an `emptyDir` as destination, then
`restore-k8s.sh` with `BACKUP_DIR` on that directory (what
`tests/k8s/restore-runner.yaml` does in the CI drill). Nothing is decrypted
before `restore-k8s.sh`, which streams each file through `age -d`.

What `restore-k8s.sh` does:

- **MongoDB**: finds the writable primary of each replica set and runs
  `mongorestore --drop --oplogReplay` there (secondaries follow). Component
  `mongodb` restores both replica sets; `mongodb-audit` the audit trail alone
  (a weekly or monthly run holds no operational dump, so `mongodb` would
  refuse it).
- **MySQL**: pipes the dump (GTID statements filtered) into the pod behind
  `mysql-primary`, with the container's own root password.
- **SPIRE**: scales `spire-server` to 0, writes `datastore.sqlite3` and
  `keys-sqlite.json` of the run (`spire/data_<TS>.tar`) into its volume and
  removes the WAL files of the replaced datastore, from a helper pod (`RESTORE_HELPER_IMAGE` if set, otherwise the image, by digest, of the `db-backup` CronJob read with `kubectl get cronjob`; the operator needs `get` on CronJobs. If the CronJob is absent, e.g. a new cluster in a total outage, it warns and falls back to `backup-tools:latest`: set `RESTORE_HELPER_IMAGE` to the released digest) running as
  the server's user, scales it back and checks `spire-server healthcheck`.
  A run taken before ADR-0065 (`spire/keys_<TS>.json`, datastore in MySQL)
  is refused: its keys do not match a SQLite journal.

#### Point-in-time restore (`--until`, ADR-0031)

```bash
# State just before 13:45 UTC (the instant itself excluded)
bash scripts/restore-k8s.sh --until 2026-11-03T13:45:00Z
bash scripts/restore-k8s.sh --until '2026-11-03 13:45' --components mongodb
```

For each database, `restore-k8s.sh` takes the newest daily run taken
before the instant whose run manifest lists it, checked against the manifest
(the checkpoints and the SPIRE datastore and keys too), then:

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
stopped). The SPIRE server no longer writes to MySQL (ADR-0065): leave it
running; `restore-k8s.sh` stops it itself for the SPIRE component.

The window is the last 72 h (archive retention). Before that, restore a
daily backup with `--timestamp`.

Every component asked for is checked (backup, checksum, `.pitr`, archive
chain, archives decrypted) in a first pass that writes nothing; the restore
starts only if all of them pass. A broken MySQL chain therefore never leaves
MongoDB already brought back to the instant: exit 1, every database as it was.

#### Point-in-time chain broken

`BackupPitrGap` fires: binlogs were purged or oplog entries overwritten before
`db-backup-incremental` archived them (job suspended or failing for longer
than the binlog / oplog window). Restores `--until` an instant after the break
are refused until a daily dump taken after it exists. Take one now instead of
waiting for 02:00, then run the incremental job so the alert clears:

```bash
kubectl create job --from=cronjob/db-backup db-backup-after-gap
kubectl create job --from=cronjob/db-backup-incremental db-backup-incremental-after-gap
```

The instants inside the break cannot be restored. For `mongodb-audit-oplog`,
if a restore later has to go back across it, the lost events are acknowledged
as an audit-chain loss (ADR-0027, `chain-cli.js acknowledge-loss`).

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

### Restoring part of MongoDB (`--ns`, `--into-scratch`)

After a targeted deletion (one collection, a few documents), do not restore the
whole replica set: that overwrites every healthy write made since the dump.

```bash
# One collection, in place: only dlq.dlq_entries is dropped and restored
bash scripts/restore-k8s.sh --components mongodb --ns 'dlq.dlq_entries'
# Same collection into a scratch database restore_<TS>_dlq, original untouched
bash scripts/restore-k8s.sh --components mongodb --ns 'dlq.dlq_entries' --into-scratch
```

- `--ns <db.coll|db.*>` is repeatable (`--nsInclude`); `--drop` only touches the
  restored collections. `--into-scratch` renames every restored database to
  `restore_<timestamp>_<db>` (`--nsFrom` / `--nsTo`, printed; the timestamp is
  the stamp of the run restored, never `latest`; `admin.*` is excluded, mongorestore
  cannot rename it); without `--ns` it
  restores every namespace there. Copy the documents back by hand, then drop the
  scratch databases.
- Only with `--components mongodb` or `mongodb-audit`; refused with `--until`.
- **Oplog choice:** `mongorestore` refuses `--oplogReplay` with `--nsInclude`,
  so a selective restore omits it: data is as of the start of the dump, not its
  end. The full-replica-set restore keeps `--oplogReplay`, which refuses
  `--nsExclude`: the dump's users and roles would come back with it, so the
  script saves the current ones and puts them back (as `__system`, through the
  keyFile) before replaying `--until` and again after it; the passwords stay
  those of the current Secrets.
- **Audit trail (ADR-0027):** restoring `audit_events` partially in place breaks
  the hash chain. every `--ns` whose database part can match `audit` (`audit.*`, `a*.*`, `*.x`...)
  without `--into-scratch` is refused; restore
  into scratch and inspect there. `scripts/restore.sh` (Docker) has no such option.

### SPIRE CA restore and SVIDs

Restoring the CA keys together with the datastore of the same backup (one
tar since ADR-0065) brings back the trust bundle unchanged: SVIDs issued
before the incident stay valid. SVIDs issued by a CA generated after the loss
(between the incident and the restore) are signed by a key no longer in the
bundle. The SPIRE agents notice the CA change and bootstrap again from the
`spire-bundle` ConfigMap within about a minute (`rebootstrap_mode`); restart
the `spiffe-helper` sidecars, or wait for their rotation, if a workload
still rejects peers after the restore. The CI drill checks that Prometheus scrapes every
target over mTLS after the restore.

Restore MySQL accounts first: dumps exclude the `mysql` schema, so after the loss of the MySQL volume run `bash deploy/k8s/scripts/run-migrations.sh trading-model user-only` (recreates `migrator`, `retention`, `exporter`) before `restore-k8s.sh --components mysql`. Otherwise later migrations, the retention job and the MySQL exporters cannot log in. The SPIRE step does not need MySQL (ADR-0065).

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

To recover in **another region** (new cluster, DNS, GitHub environment, bucket
access), follow the runbook in
[MULTI_REGION.md](MULTI_REGION.md#disaster-recovery-without-a-second-region);
it calls the steps below.

Before step 1 you need an age private key that decrypts the backups: the
operator key, or the escrow key from the safe if it is lost
([Key custody](ENCRYPTION_AT_REST.md#key-custody)).

1. Provision replacement hosts and install Kubernetes. Restore the
   SealedSecrets controller keys **before** the manifests are deployed:
   without them no SealedSecret of `deploy/k8s/secrets/` decrypts in the new
   cluster. `bash scripts/restore-sealed-secrets-key.sh --identity <key file>`
   (newest `sealed-secrets-key_<TIMESTAMP>.yaml.age` of the off-site bucket,
   same credentials as below, restored into the namespace `sealed-secrets`),
   then install the controller (`bash scripts/install-sealed-secrets.sh`)
   ([sealed-secrets.md](sealed-secrets.md#restore-the-controller-keys-in-a-new-cluster)).
   Then deploy the manifests from git (`deploy.yml`), back up the keys of
   the new cluster (`bash scripts/backup-sealed-secrets-key.sh`) and create
   the identity of the daily key backup again
   (`bash scripts/sealed-secrets-backup-identity.sh | gh secret set
   SEALED_SECRETS_BACKUP_KUBECONFIG --env sealed-secrets-key-backup`): until
   then `sealed-secrets-key-backup.yml` fails every day
2. Fetch the newest complete run from the off-site bucket, still encrypted:
   `bash scripts/fetch-offsite.sh --dest ./restore` (credentials and options
   in [From the off-site bucket](#from-the-off-site-bucket)); it prints the
   `restore-k8s.sh` command for the steps below (`BACKUP_DIR=./restore`,
   `--timestamp` of the fetched run). Add `--pitr` to fetch the binlog /
   oplog archives as well and restore with `--until` (RPO 1 h). The CI drill logs how long the fetch
   and the restore took
3. Check the key on the fetched run: `bash scripts/verify-backup-key.sh
   --identity <key file> --dir ./restore` (exit 1: try the other key), then
   restore the databases: MongoDB, MySQL
4. Restore the SPIRE datastore and CA keys (`--components spire`), which
   restarts the SPIRE server
5. Restore the trainer checkpoints
6. Run `bash scripts/verify-restore-k8s.sh` (business checks, see Recovery
   Verification), then verify health endpoints, service registration in
   discovery-server and the Prometheus targets (all `up` means mTLS works)

### Recovery Verification

After `restore-k8s.sh`, one read-only command checks the restored data:

```bash
K8S_NAMESPACE=trading-model bash scripts/verify-restore-k8s.sh
# Optional freshness limit: add --max-candle-age-hours 48
# BACKUP_DIR=/restore BACKUP_AGE_IDENTITY=key.txt also reads the run manifest
```

It prints OK / KO per check and exits 1 on any KO: audit chain
(`tests/backup/audit-chain.js`, `broken` null, count > 0), dead letter count,
`market_candles` rows and latest timestamp, SPIRE registration entries
(read through the server, ADR-0065),
SPIRE trust bundle retrievable, and the run manifest counts. The manifest
currently records size and sha256 only, no row counts: the script says so and
compares nothing. The kind drill runs it after the restore, and checks that it
fails on an altered audit event. Then the service checks:

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
| `ci.yml`, job `k8s` (pull requests touching the filter of its "Decide the restore drill" step, every release through `workflow_call`, pushes to main and development) | Kind restore drill with PITR and loss of the cluster (`tests/k8s/run-kind.sh`, `verify_backup`): backup, [run manifest](#run-manifest), [off-site fetch](#from-the-off-site-bucket), [point-in-time restore](#point-in-time-restore---until-adr-0031), then checks of the audit chain, dead letters, markers, `market_candles` and the SPIRE bundle |
| `backup-test.yml`, job `sealed-secrets-key` (weekly, on changes to the scripts) | Key backup and restore across two kind clusters (`tests/backup/sealed-secrets-key.test.sh`, `tests/k8s/sealed-secrets-key-drill.sh`), see `docs/deployment/sealed-secrets.md` |
| `backup-test.yml` (weekly, on changes to the scripts; Docker only, no PITR or replica set) | Library tests of `tests/backup/` ([encryption](#automated-backup-system), [off-site immutability](#off-site-immutability), [PITR chains](#point-in-time-archives-adr-0031), [partial backups and manifest](#run-manifest), [off-site fetch](#from-the-off-site-bucket)), then the Docker restore drill (`tests/backup/compose-restore-drill.sh`) |

Drill timings (issue #329): both drills time every step (`tests/backup/drill-timings.sh`) and publish a table in the job summary and `restore-drill-timings.json` as an artifact (`restore-drill-timings-kind`, `restore-drill-timings-docker`). The recovery window (data destroyed to checks done) is compared with `RESTORE_DRILL_BUDGET_SECONDS` (default 1200 s kind, 300 s Docker; `0` = no check); `RESTORE_DRILL_BUDGET_MODE=fail` (default) fails the drill when it is exceeded, `warn` only warns. The defaults are about 5 times the recovery window of the first CI run (252 s kind, 20 s Docker, run 41643357917), so a step that doubles or hangs is caught without failing a healthy run on a slower runner; they are not the RTO (kind on a CI runner is not sized like production), which is judged on real exercises ([DR Exercise Log](../compliance/dr-exercise-log.md)). A drill that fails half way still publishes the steps it measured (`"status": "failed"`). `restore-k8s.sh` logs `restore-timing component=<c> seconds=<n>` for each component it restores, also outside CI.

## Known Limits

- **SealedSecrets controller keys are backed up once a day** by
  `sealed-secrets-key-backup.yml` (ADR-0035): a key created less than 24 h
  before the loss of the cluster may be missing, unless an operator ran
  `scripts/backup-sealed-secrets-key.sh` after the change
  ([sealed-secrets.md](sealed-secrets.md#back-up-the-controller-keys)). The
  workflow holds a production kubeconfig that can list every Secret of the
  controller namespace (RBAC cannot filter by label). That namespace,
  `sealed-secrets`, holds the controller keys and the identity's token only:
  a leak of the kubeconfig exposes every SealedSecret of the repository, no
  other cluster credential (response in
  [sealed-secrets.md](sealed-secrets.md#daily-backup-by-github-actions)).
  Deploying anything else in `sealed-secrets` widens that exposure. The
  workflow needs the API server reachable from GitHub-hosted runners.
- **A disabled schedule stops the key backup without any failed run.**
  GitHub disables the `schedule` trigger of a public repository after 60
  days without activity, and mails a failed scheduled run only to the last
  person who changed the cron. `sealed-secrets-key-backup.yml` and
  `backup-key-check.yml` (ADR-0034) then stop silently: nothing fails, so
  nothing alerts. Check that the newest
  `sealed-secrets-key_<TIMESTAMP>.yaml.age` of the bucket is less than two
  days old, and that both workflows are enabled
  (`gh workflow list --all`), at least at each quarterly operator-key check
  ([Key custody](ENCRYPTION_AT_REST.md#key-custody)).

- **RPO 1 h, not continuous** (ADR-0031): writes since the last hourly
  archive are lost with the volume. Point in time only over the last 72 h;
  older restores are day by day. The SPIRE datastore and CA keys stay daily.
- **Point-in-time in Kubernetes only**: the Docker scripts restore the daily
  dump (no binlog or oplog archive; compose MongoDB is not a replica set).
- **After a point-in-time restore onto a new MySQL volume**, the server has a
  new uuid: its binlogs go to a new directory, and the next point-in-time
  restore needs the next daily dump. Run `db-backup` by hand after such a
  restore to shorten that window.
- **DDL between the dump and the instant** (a migration) replays as is: a
  statement the restored schema rejects stops the replay with exit 1.
- **Docker stack**: no scheduler, no backup metrics scraped, Redis without
  persistence (the message journal is lost on restart). Compose is a development stack: do not
  store real data in it ([SETUP.md](SETUP.md#local-development-setup),
  [DOCKER.md](DOCKER.md#docker-compose-services)).
- **Business validation after a restore** is `scripts/verify-restore-k8s.sh`
  (Recovery Verification); it has no source of expected row counts (the run
  manifest holds none) and the audit anchors (ADR-0027) are not checked.
- Events stored before 2026-10-31 hold `correlationId: null` where their hash saw no field; the
  verifier drops that null (audit-logger never hashes one), so they verify too.

## Ownership

- Backup automation: DevOps / Platform team
- Restore procedure validation: CI (every run) + SRE review (quarterly)
- Backup keys: operator key (Platform team), escrow key (project owner);
  escrow key decrypted weekly by the `Backup Key Check` workflow (ADR-0034),
  operator key quarterly by hand with `scripts/verify-backup-key.sh`, output
  kept in the operations log ([Key custody](ENCRYPTION_AT_REST.md#key-custody))
- Secrets rotation: Security team (quarterly)
- DR drill coordination: Engineering manager (bi-annual)
