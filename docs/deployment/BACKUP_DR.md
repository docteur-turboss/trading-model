# Backup & Disaster Recovery

## Overview

This document defines the backup strategy, disaster recovery procedures, and
restore verification for the trading-model platform.

> **Status (2026-10-28):** a backup counts only once it has been restored.
> Both sets of scripts are restored for real by CI:
>
> - Kubernetes: every run of the CI `k8s` job backs up with the `db-backup`
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
| MySQL `spire`                 | SPIRE Server (datastore)                      | Critical    | 1 h (hourly binlog archive) | 4 hours    |
| SPIRE `keys.json`             | SPIRE Server (CA private keys)                | Critical    | 24 h (daily backup: a file, no journal) | 4 hours    |
| Trained agents                | trader-trainer (checkpoint files)             | Medium      | 24 h (daily tar)       | 1 hour     |
| SealedSecrets controller keys | Sealed Secrets controller (`kube-system`): decrypts every SealedSecret of `deploy/k8s/secrets/` | Critical | Last manual run of `scripts/backup-sealed-secrets-key.sh` (after every key change, see [sealed-secrets.md](sealed-secrets.md#back-up-the-controller-keys)) | 1 hour |
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

**Fallback.** The GitHub environment variable
`BACKUP_S3_IMMUTABILITY_CHECK=warn` turns the production error into a
warning while the bucket is being set up (the downgrade is itself reported
on every deploy); remove it once the check passes. `enforce` makes a staging
deploy fail too. There is no value that skips the check. Tested by
`tests/backup/backup-bucket-check.test.sh` (stub `aws` CLI; workflow
`backup-test.yml`).

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
- `checkpoints`, the operational `mongodb` (DLQ, 30 days) and `spire/keys`
  (CA private keys) are never promoted: data minimisation, see the
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
`checkpoints/checkpoints_<TS>.tar.gz.age`, `spire/keys_<TS>.json.age`,
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
- **SPIRE**: scales `spire-server` to 0, writes `keys.json` into its volume
  from a helper pod (`RESTORE_HELPER_IMAGE`, default `backup-tools`) running as
  the server's user, scales it back and checks `spire-server healthcheck`.

#### Point-in-time restore (`--until`, ADR-0031)

```bash
# State just before 13:45 UTC (the instant itself excluded)
bash scripts/restore-k8s.sh --until 2026-11-03T13:45:00Z
bash scripts/restore-k8s.sh --until '2026-11-03 13:45' --components mongodb
```

For each database, `restore-k8s.sh` takes the newest daily run taken
before the instant whose run manifest lists it, checked against the manifest
(the checkpoints and SPIRE keys too), then:

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

Before step 1 you need an age private key that decrypts the backups: the
operator key, or the escrow key from the safe if it is lost
([Key custody](ENCRYPTION_AT_REST.md#key-custody)).

1. Provision replacement hosts and install Kubernetes. Restore the
   SealedSecrets controller keys **before** the manifests are deployed:
   without them no SealedSecret of `deploy/k8s/secrets/` decrypts in the new
   cluster. `bash scripts/restore-sealed-secrets-key.sh --identity <key file>`
   (newest `sealed-secrets-key_<TIMESTAMP>.yaml.age` of the off-site bucket,
   same credentials as below), then install the controller
   ([sealed-secrets.md](sealed-secrets.md#restore-the-controller-keys-in-a-new-cluster)).
   Then deploy the manifests from git (`deploy.yml`), and back up the keys of
   the new cluster (`bash scripts/backup-sealed-secrets-key.sh`)
2. Fetch the newest complete run from the off-site bucket, still encrypted:
   `bash scripts/fetch-offsite.sh --dest ./restore` (credentials and options
   in [From the off-site bucket](#from-the-off-site-bucket)); it prints the
   `restore-k8s.sh` command for the steps below (`BACKUP_DIR=./restore`,
   `--timestamp` of the fetched run). Add `--pitr` to fetch the binlog /
   oplog archives as well and restore with `--until` (RPO 1 h). The CI drill logs how long the fetch
   and the restore took
3. Check the key on the fetched run: `bash scripts/verify-backup-key.sh
   --identity <key file> --dir ./restore` (exit 1: try the other key), then
   restore the databases: MongoDB → MySQL (incl. SPIRE `spire`)
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
| `ci.yml`, job `k8s` (every push to main/development and every PR) | Staging overlay on kind: drill markers seeded, real audit chain recorded, a dead letter stored the way message-manager stores them (`tests/k8s/dlq-seed.cjs`: signed `POST /dlq` over mTLS), `db-backup` run (age key generated for the run, off-site copy to an in-cluster S3), then markers, audit events and a dead letter written **after** the dump, writers stopped (audit-logger, dlq-service, financial-scraper, financial-scraper-collector), the instant recorded, one more marker after it, `db-backup-incremental` run (archives encrypted, off-site), data destroyed (`audit` and `dlq` databases, markers, `market_candles`, SPIRE server volume), the run (dumps and run manifest) and its binlog / oplog archives fetched from the in-cluster S3 by `fetch-offsite.sh --pitr` into a pod without `backup-data` (an instant past the archives refused there by `restore-k8s.sh --until`; fetch and restore durations logged), `restore-k8s.sh --until <instant>` on it, checks: the audit chain exactly as at the instant (events written after the dump included, same hashes, chain verified by `tests/backup/audit-chain.js`), every dead letter of the instant back, markers 1-4 and not 5 in both MongoDB replica sets and MySQL, `market_candles` back, SPIRE trust bundle identical, audit-logger extends the restored chain once restarted, every Prometheus target up over mTLS |
| `backup-test.yml`, job `sealed-secrets-key` (weekly, on changes to the scripts) | `tests/backup/sealed-secrets-key.test.sh` (stub kubectl and rclone: keys encrypted for every recipient, no plaintext on disk, exit 1 and nothing written without key, recipient or bucket, or when the export, age or the copy fails; restore picks the newest file or `--timestamp`, refuses a wrong key before applying anything, restarts the controller), then `tests/k8s/sealed-secrets-key-drill.sh` on kind: a secret sealed in cluster A with controller v0.27.1, keys backed up to an S3 bucket, cluster A deleted, cluster B with a new controller does not decrypt the SealedSecret, keys restored from the bucket, the SealedSecret decrypts to the original value |
| `backup-test.yml` (weekly, on changes to the scripts) | Library tests (`tests/backup/backup-encryption.test.sh`; `tests/backup/backup-key-verify.test.sh`: `BACKUP_MIN_RECIPIENTS` refusals, deploy recipients check, `verify-backup-key.sh` with each of two keys passing and a third key, a component sealed for another key or missing failing; `tests/backup/backup-bucket-check.test.sh`: Object Lock check of the off-site bucket with a stub `aws` CLI, compliance 30-31 days passes, absent, governance, too short or too long fails in production and warns in staging, `BACKUP_S3_IMMUTABILITY_CHECK` fallback; `tests/backup/pitr-chain.test.sh`: archive chains, gaps refused, no partial file, incremental metrics; `tests/backup/backup-partial.test.sh`: a failed dump leaves no file, the manifest lists the successful dumps, `latest` skips a newer failed run, sha256 / size mismatch and a MySQL dump without `-- Dump completed` are refused, an unreadable manifest (no or wrong key, corrupt file, plaintext manifest without the expected structure) fails the restore, older backups only with `--timestamp`), off-site fetch tests (`tests/backup/fetch-offsite.test.sh` in the `backup-tools` image: runs uploaded by `upload_offsite` to `rclone serve s3`, newest complete run (every dump and its manifest) chosen over a newer incomplete one, `--timestamp`, `--components`, `--dry-run`, `--pitr` (PITR starting points and the binlog / oplog archives from the run on), layout read by `restore-k8s.sh` with the manifest checksums, files still encrypted, exit 1 on an incomplete or absent run, an empty or unreachable bucket, a non-empty destination), then the Docker drill: an audit trail written by the audit-logger image code (`tests/backup/seed-audit-chain.cjs`, events in the pre-2026-10-31 format, then current ones), MongoDB (3 databases), MySQL, Redis and the SPIRE server backed up, containers and volumes deleted, restored, checked (same audit events and hashes, chain verified, SPIRE trust bundle identical) |

## Known Limits

- **SealedSecrets controller keys are backed up by hand**: an operator runs
  `scripts/backup-sealed-secrets-key.sh` after every key change
  ([sealed-secrets.md](sealed-secrets.md#back-up-the-controller-keys)). A key
  renewed by the controller (every 30 days) and never backed up is lost with
  the cluster, together with the secrets sealed with it.

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
- Backup keys: operator key (Platform team), escrow key (project owner);
  escrow key decrypted weekly by the `Backup Key Check` workflow (ADR-0034),
  operator key quarterly by hand with `scripts/verify-backup-key.sh`, output
  kept in the operations log ([Key custody](ENCRYPTION_AT_REST.md#key-custody))
- Secrets rotation: Security team (quarterly)
- DR drill coordination: Engineering manager (bi-annual)
