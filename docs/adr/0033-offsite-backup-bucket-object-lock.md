# ADR-0033: Off-site Backup Bucket Under Object Lock (Compliance, 30-31 Days), Checked Before Every Deploy

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) (anchor bucket, same model), [ADR-0032](./0032-gfs-backup-retention.md) (GFS tiers and lifecycle rules), [ADR-0031](./0031-point-in-time-recovery-hourly-archives.md) (binlog and oplog archives), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `tests/backup/backup-bucket-check.test.sh`

## Context

The off-site copy of the encrypted backups (Secret `trading-model-backup-s3`, `upload_offsite` in `scripts/backup-lib.sh`) is the only copy left after the loss of the cluster. Its credentials live in the application namespace. The repository neither imposed nor checked any immutability on the bucket: `docs/deployment/BACKUP_DR.md` said "Enable versioning or object lock on the bucket", and the "Configure off-site backup copy" step of `deploy.yml` wrote the Secret without reading anything. Whoever controls the namespace (or a ransomware running there) could delete the databases and, with the same credentials, their off-site copies: total loss (audit sauvegarde-restauration 2026-11-01, finding A3, "backup breaker" no. 3, issue #326). The anchor bucket of the audit chain already required Object Lock in compliance mode and dedicated credentials (ADR-0027 §3, §6).

ADR-0032 set the off-site retention: lifecycle rules expire `daily/` after 31 days, `weekly/` after 85, `monthly/` after 1830; the job never deletes in the bucket, which keeps Object Lock possible. Its §7 keeps the DLQ, checkpoints and SPIRE CA private keys at most 31 days off-site (data minimisation).

## Decision

1. **Object Lock in compliance mode, bucket default retention between `RETENTION_DAYS` (30) and 31 days.** Every uploaded version is locked from its upload; nobody, the account owner included, can delete or overwrite it before the date. The lower bound covers the daily backups a restore relies on; the upper bound is the expiry of the `daily/` lifecycle rule (ADR-0032): a longer lock would keep the DLQ, checkpoints and CA keys past their 31 days and stop the lifecycle rules from expiring them. Governance mode is refused (bypassable with `s3:BypassGovernanceRetention`). Weekly and monthly copies are locked their first 30 days, then expire by their own rules. The lock is a bucket default, not a per-object retention: the job needs no `s3:PutObjectRetention` right and the lifecycle rules stay the only expiry.
2. **Credentials without delete right**: put, get, list, plus the read of the Object Lock and lifecycle configuration; `s3:DeleteObject`, `s3:DeleteObjectVersion`, `s3:PutBucketObjectLockConfiguration` and the other bucket-setting actions are denied (policy in `BACKUP_DR.md`, "Off-site immutability"). Bucket settings are changed with admin credentials kept outside the cluster and the GitHub environment.
3. **Checked before every deploy.** `scripts/backup-bucket-check.sh` reads `get-object-lock-configuration` with the credentials the job will use (GitHub environment, or else the existing `trading-model-backup-s3` Secret), before anything is applied. In production a problem fails the deploy: no bucket, configuration unreadable (no Object Lock, provider without Object Lock, missing read right, store unreachable), no default retention, governance mode, retention outside `RETENTION_DAYS` (read from the `db-backup` CronJob) to 31 days. Elsewhere it is a warning.
4. **Explicit, visible fallback.** The GitHub environment variable `BACKUP_S3_IMMUTABILITY_CHECK=warn` downgrades the production error to a warning while the bucket is set up, and the downgrade is reported on every deploy. `enforce` makes another environment strict. No value skips the check.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Keep "versioning or object lock" as a recommendation | The defect itself: nothing checks it, and versioning alone lets the credentials delete every version |
| Governance mode | Bypassable by anyone granted `s3:BypassGovernanceRetention`; compliance is what ADR-0027 already uses |
| Default retention as long as the longest tier (1830 days) | Every daily copy, CA keys and DLQ included, would stay 5 years: breaks ADR-0032 §7 and multiplies storage |
| Per-object retention by tier set by the job (`PutObjectRetention`) | Would lock weekly and monthly copies for their whole life, but gives the cluster credentials a retention right and needs the aws CLI or rclone options in the job; can be added later on top of this decision |
| Warning only in production when the provider has no Object Lock | Leaves the backup breaker in place silently; the explicit fallback variable covers the set-up period |
| Check in the backup CronJob instead of the deploy | The `backup-tools` image has no aws CLI, and a failure would show the day after, not before the deploy |

## Consequences

- Production deploys fail until the bucket has Object Lock in compliance mode with a 30- or 31-day default retention, or until `BACKUP_S3_IMMUTABILITY_CHECK=warn` is set. Object Lock is enabled at bucket creation on most providers (AWS also on an existing versioned bucket): an existing bucket without it is replaced, not converted.
- Weekly and monthly copies older than 30 days are protected by the credentials' missing delete right, not by the lock: someone holding the account's admin credentials can still delete them. Accepted; per-object retention is the next step if needed.
- Binlog and oplog archives (ADR-0031) stay locked 30 days though their lifecycle rule hides them after 3: storage of about 30 days of archives instead of 3.
- Under Object Lock the bucket is versioned: lifecycle expiry puts a delete marker, noncurrent versions need their own expiry rule (`BACKUP_DR.md`, Off-site tiers). rclone `copy --s3-no-check-bucket` only adds versions (verified on 2026-11-03 against an S3 emulator with Object Lock: uploads, multipart, re-copy skipped, modification-time update as a new version, delete of a locked version refused).
- Trust moves to the provider's Object Lock implementation, as for the anchors (ADR-0027). The real configuration of the production bucket is outside the repository: the check proves it at each deploy, not continuously.
- No error is swallowed (ADR-0017): an unreadable configuration is a problem, never a pass.
