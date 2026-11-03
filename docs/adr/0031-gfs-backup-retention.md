# ADR-0031: Grandfather-Father-Son Backup Retention, Long Tiers Off-site for the Audit Trail and MySQL

**Status:** Accepted
**Date:** 2026-11
**Verified by:** `tests/backup/backup-retention.test.sh`

## Context

Backups were kept 30 days: `prune_old` (`scripts/backup-lib.sh`) deleted every file of `/backups` older than `RETENTION_DAYS` (30) by its mtime, all components alike, and off-site retention was left to an unspecified bucket lifecycle rule. The audit trail and the market data must be kept 5 years (`docs/compliance/data-retention-policy.md`, MiFID II art. 16(6), Delegated Reg. (EU) 2017/565 art. 72). A corruption or logical deletion found after 30 days was unrecoverable: every backup still on hand already held the corrupted state (audit sauvegarde-restauration 2026-11-01, finding A7, issue #292).

A run backs up, per file: `mongodb/<TS>/mongodb-audit.archive.gz.age` (audit trail, 5 years), `mongodb/<TS>/mongodb.archive.gz.age` (operational database, `dlq_entries` 30 days), `mysql/financial_scraper_<TS>.sql.gz.age` (one dump holding `financial_scraper`, 5 years, and the SPIRE datastore `spire`), `checkpoints/…` and `spire/keys_<TS>.json.age` (SPIRE CA private keys). Run manifests (issue #288) list the dumps of a run that succeeded.

Options were put to the project owner on issue #292; the owner chose option 1 + B1 + C2 on 2026-11-03.

## Decision

1. **Tiers.** Daily: every run, every component, 30 days (`RETENTION_DAYS`). Weekly: the first complete run of each ISO week, 12 weeks. Monthly: the first complete run of each calendar month, 60 months. Only `mongodb-audit` and `mysql` are promoted (`RETENTION_LONG_COMPONENTS`).
2. **Long tiers off-site only.** The `backup-data` PVC (100Gi) keeps the dailies: the CronJob leaves `RETENTION_WEEKLY_WEEKS` and `RETENTION_MONTHLY_MONTHS` at 0. With `BACKUP_OFFSITE_LAYOUT=tiered`, `upload_offsite` copies every file under `daily/`, and the promoted dumps with their manifest also under `weekly/` and `monthly/`. The same tiers can be kept locally by setting the two variables (Docker hosts).
3. **Off-site expiry by bucket lifecycle rules (B1)**, one per prefix: `daily/` 31 days, `weekly/` 85 days, `monthly/` 1830 days, documented in `docs/deployment/BACKUP_DR.md` ("Off-site tiers"). The job never deletes in the bucket, so its credentials need no delete right (compatible with Object Lock, finding A3). `check_offsite_lifecycle` reads the rules when the `aws` CLI is there and warns otherwise.
4. **Complete run (C2).** The run manifest of issue #288 is the source: a run is complete for a component when its manifest exists and the component's final file exists (`write_dump` renames a dump only when it succeeded). No decryption is needed, so the job, which holds no age identity, can apply it. Only complete runs are promoted. The first run of a week or month is promoted, rather than Sunday's, because the off-site tier must be chosen at upload time.
5. **Ages from the file name.** `prune_old` reads the `%Y-%m-%d_%H%M%S` timestamp in the name (calendar arithmetic in awk, no `date -d`, which BusyBox and GNU parse differently), never the mtime, which a copy or a fetch from the bucket changes. Files without timestamp fall back to their mtime; `metrics/` is never touched.
6. **Guard.** The newest complete run of each component is never deleted, whatever its age; a component without any complete run keeps its newest file. Without any new variable the policy is the former one (30 days) plus this guard.
7. **Minimisation (GDPR).** The DLQ, checkpoints and SPIRE CA private key backups are never promoted: they never outlive 30 days (31 off-site). The `spire` database rides in the promoted MySQL dump (registration entries, trust bundle, no private key): accepted, low stakes. A monthly backup keeps what it contains up to 60 months after it was taken, so a record may outlive its live retention in an encrypted backup; accepted because the 5 years are a regulatory minimum and the backups hold no personal data (data processing register, activity 7).

## Consequences

- About 30 daily, 12 weekly and 60 monthly copies of the audit and MySQL dumps off-site: storage cost proportional to their size. The local volume is unchanged.
- Restoring a long tier goes through the bucket: the layout under each prefix is the volume's, so a fetch points `BACKUP_S3_BUCKET` at `…/<tier>` (issue #290). The weekly and monthly prefixes hold no operational `mongodb`, checkpoints or CA keys.
- Off-site expiry relies on rules set outside the repository. A missing rule keeps copies forever, it never loses one; with rclone only (the `backup-tools` image), the rules are not verified by the job.
- Consistent with ADR-0027: audit anchors keep their own Object Lock retention (`AUDIT_RETENTION_DAYS`) in a separate bucket. No error is swallowed (ADR-0017): a failed retention plan is reported and prunes nothing.
- Out of scope: Object Lock on the backup bucket (A3), point-in-time recovery (issue #291), purge of market data in MySQL (DPIA action #2), PVC usage monitoring (A14).
