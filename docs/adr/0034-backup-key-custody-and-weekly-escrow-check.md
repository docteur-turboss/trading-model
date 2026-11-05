# ADR-0034: Two Backup Keys in Production, Escrow Key Verified Weekly by GitHub Actions

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0033](./0033-offsite-backup-bucket-object-lock.md) (off-site bucket, read-only credentials), [ADR-0032](./0032-gfs-backup-retention.md) (5-year tiers), [ADR-0031](./0031-point-in-time-recovery-hourly-archives.md), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `tests/backup/backup-key-verify.test.sh`

## Context

Every backup is encrypted with age for the recipients of `BACKUP_AGE_RECIPIENTS` (`scripts/backup-lib.sh`). Production accepted a single recipient, and nothing proved that a private key still held by someone decrypts the production backups: an age X25519 file does not name its recipients, only a real decryption proves a key works. A lost key, or a wrong value of the variable, made every backup unreadable, and nobody would know before the restore (audit sauvegarde-restauration 2026-11-01, finding A4, "backup breaker" no. 2, issue #327).

The proof has a price. Any key able to run the check decrypts the whole off-site history too: 5 years of audit trail and market data, and 31 days of SPIRE CA private keys (ADR-0032). The choice is between keeping the escrow key offline, with a manual and therefore rare check, and putting it where an automated check can use it. The project owner chose automation (issue #327, 2026-11-03).

## Decision

1. **At least two distinct recipients in production**: an operator key and an escrow key. `init_encryption` refuses fewer distinct valid keys than `BACKUP_MIN_RECIPIENTS` (default 1, 2 in the production overlay on `db-backup` and `db-backup-incremental`): exit 1, `backup_last_status{component="encryption"} 0`, alert `BackupUnencrypted`. `deploy.yml` fails a production deploy before any change when the recipients hold fewer than 2 distinct `age1…` keys (`scripts/backup-recipients-check.sh`).
2. **`scripts/verify-backup-key.sh --identity <file>`** is the proof: it fetches the newest complete off-site run (`scripts/fetch-offsite.sh`) or reads a directory, decrypts the run manifest, then every component whole into `sha256sum` (no plaintext on disk), compares each with the manifest, prints the key's public key and the run date, and exits 1 at the first component that is missing or does not decrypt.
3. **Weekly automated check of the escrow key** (`.github/workflows/backup-key-check.yml`, Monday 07:00 UTC, also on demand). The escrow private key is the secret `BACKUP_ESCROW_AGE_IDENTITY` of a dedicated GitHub environment, `backup-key-check`, whose deployment branches are restricted to the default branch. The deploy jobs (environments `staging` / `production`) never receive it. The same environment holds read-only credentials of the off-site bucket (`BACKUP_S3_READ_*`: list and get only, distinct from the job's put credentials). The job writes the key to a tmpfs, mode 600, never in an argument or a log, runs the script in the `backup-tools` image, deletes the key in an `always()` step, and publishes the report in the run summary. A missing secret or variable fails the run, it is never a skipped check.
4. **The operator key** is checked by hand on the same procedure (quarterly and after every key change); it stays in the team password manager and is not stored in GitHub.
5. **Custody, rotation and trace** are in `docs/deployment/ENCRYPTION_AT_REST.md` ("Key custody"). The escrow key keeps an offline copy (safe and encrypted USB) as the restore copy; the GitHub secret is a copy for the check, not the reference.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Single recipient, documented | The defect itself; rejected by the audit |
| Manual quarterly check, escrow key offline only | Keeps the key out of GitHub, but rests on human discipline; a key that stops working goes unnoticed up to 3 months. Not chosen by the project owner |
| Manual check plus public keys pinned in the repository | Blocks a wrong variable at deploy without exposing a private key, but the decryption proof stays manual and quarterly. Not chosen |
| Escrow key in a HSM / KMS (age plugin) | Strongest and automatable without exposing the key, but a new provider dependency and several days of work; out of scope, can supersede this ADR later |
| Escrow secret in the `production` environment | Every deploy job would receive the escrow key, and required reviewers on `production` would block the scheduled run every week |

## Consequences

- The escrow key is no longer offline only. Whoever can read the `backup-key-check` environment secrets (a repository admin, a workflow change merged to the default branch, a compromise of GitHub) can decrypt every backup that the off-site credentials let them fetch. Accepted by the project owner for a weekly proof. Mitigations: dedicated environment restricted to the default branch, branch protection and review on workflow changes, read-only bucket credentials, key on tmpfs and deleted after each run. A suspected exposure of the secret is handled as an exposed key (rotation, `ENCRYPTION_AT_REST.md`).
- A failed weekly run is a backup incident: the escrow key no longer opens the newest backups (or the bucket, the run or a component is missing). GitHub notifies on the failed scheduled run; the report is in the run summary, kept as long as the repository's Actions logs (90 days by default). Quarterly operator-key checks stay in the operations log.
- Until the environment `backup-key-check` and its secrets exist, the scheduled run fails every week: that is the intended signal, not noise to silence.
- The weekly check covers the daily tier. The weekly and monthly tiers (audit trail and MySQL only) are checked on demand with `tier` and `components: mongodb-audit,mysql`.
- No error is swallowed (ADR-0017): every missing input or failed decryption fails the run.
