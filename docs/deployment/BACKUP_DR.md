# Backup & Disaster Recovery

## Overview

This document defines the backup strategy, disaster recovery procedures, and
restore verification for the trading-model platform.

> **⚠️ STATUS NOTE (June 2026):** The backup system has been audited and
> remediated. All 🔴 blocking issues (P1-P6) are resolved. Backups are now
> automated, tested weekly, and stored off-site. See
> `scripts/backup.sh` / `scripts/restore.sh` (Docker) or
> `scripts/backup-k8s.sh` / `scripts/restore-k8s.sh` (Kubernetes) for
> the current tooling.

## Data Classification

| Data Store         | Service                                          | Criticality | RPO Target                  | RTO Target |
| ------------------ | ------------------------------------------------ | ----------- | --------------------------- | ---------- |
| MongoDB            | audit-logger, dlq-service, certificate-authority | High        | 1 hour                      | 4 hours    |
| MySQL              | financial-scraper                                | High        | 1 hour                      | 4 hours    |
| Redis              | discovery-server, message-manager, dlq-service   | Medium      | 15 min (RDB)                | 1 hour     |
| Trained agents     | trader-trainer (checkpoint files)                | Medium      | 1 hour                      | 1 hour     |
| CA keys            | certificate-authority (mTLS root)                | Critical    | 24 hours                    | 4 hours    |
| Docker/K8s volumes | All persisted data                               | High        | N/A (covered by DB backups) | N/A        |

## Automated Backup System

### Docker

```bash
# Full backup (all components)
bash scripts/backup.sh

# Selective backup
bash scripts/backup.sh --components mongodb,mysql

# Dry-run (preview without executing)
bash scripts/backup.sh --dry-run

# With S3 off-site upload
BACKUP_S3_BUCKET=s3://my-bucket/backups bash scripts/backup.sh
```

### Kubernetes

A CronJob runs daily at 2:00 AM:
`deploy/k8s/jobs/backup-cronjob.yaml`

Manual execution:

```bash
# Create a manual backup job
kubectl create job --from=cronjob/db-backup db-backup-manual

# Or run the script directly
BACKUP_DIR=/backups bash scripts/backup-k8s.sh
```

### Components Backed Up

| Component                               | Method                                           | Consistency                     |
| --------------------------------------- | ------------------------------------------------ | ------------------------------- |
| MongoDB (dlq-service, audit-logger, CA) | `mongodump --gzip --oplog --archive`             | Point-in-time consistent        |
| MySQL (financial-scraper)               | `mysqldump --single-transaction --all-databases` | Transaction-consistent snapshot |
| Redis (primary)                         | `redis-cli BGSAVE` + copy `dump.rdb`             | Fork-consistent                 |
| CA keys (certificate-authority)         | `tar czf` of `/etc/ca-keys/`                     | Filesystem snapshot             |
| Trainer checkpoints (trader-trainer)    | `tar czf` of `/data/checkpoints/`                | Filesystem snapshot             |

### Off-site Storage (Optional)

Set `BACKUP_S3_BUCKET` to enable automatic S3 upload after each backup.
Requires `aws` or `rclone` CLI. In K8s, create the secret
`trading-model-backup-s3` with keys:
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
`BACKUP_S3_BUCKET`.

### Retention

- Daily backups: 30 days (auto-pruned by `prune_old`)
- Weekly/monthly retention: manual or policy-based (via cron rule)

## Restore Procedures

### Docker — Automated

```bash
# Restore latest backup (all components)
bash scripts/restore.sh

# Restore specific timestamp
bash scripts/restore.sh --timestamp 2025-01-01_120000

# Restore selective components
bash scripts/restore.sh --components mongodb,mysql

# Dry-run (show what would be restored)
bash scripts/restore.sh --dry-run
```

### Kubernetes — Automated

```bash
# Restore latest backup
BACKUP_DIR=/backups bash scripts/restore-k8s.sh

# Restore specific timestamp
BACKUP_DIR=/backups RESTORE_TIMESTAMP=2025-01-01_120000 bash scripts/restore-k8s.sh
```

### Manual MongoDB Restore

```bash
docker exec <mongo-container> mongorestore \
  --gzip --drop --archive=/tmp/restore.archive.gz
```

Verify:

```bash
docker exec <mongo-container> mongosh \
  --eval "db.getSiblingDB('audit_logger').audit_events.countDocuments()"
```

### Manual MySQL Restore

```bash
gunzip < /backups/mysql/financial_scraper_<date>.sql.gz \
  | docker exec -i trading-mysql mysql --user=root --password=$MYSQL_ROOT_PASSWORD
```

Verify:

```bash
docker exec trading-mysql mysqlcheck --all-databases --user=root --password=$MYSQL_ROOT_PASSWORD
```

### Manual Redis Restore

1. Stop Redis primary
2. Replace `dump.rdb` with backup copy
3. Restart Redis primary
4. Verify: `docker exec trading-redis-primary redis-cli DBSIZE`

## Disaster Recovery

### Failure Scenarios

| Scenario               | Impact           | Recovery Action                                  |
| ---------------------- | ---------------- | ------------------------------------------------ |
| Single container crash | Degraded service | Docker auto-restart (restart: unless-stopped)    |
| Node failure           | Full outage      | Redeploy on healthy node from Docker Compose     |
| Data corruption        | Data loss        | Restore from latest backup                       |
| Full region failure    | Complete outage  | Deploy to secondary region (see MULTI_REGION.md) |
| Secrets leak           | Security breach  | Rotate all secrets, revoke certificates from CA  |

### Recovery Steps for Total Outage

1. Provision replacement hosts (bare metal / cloud instances)
2. Restore Docker Compose configuration from git
3. Restore TLS certificates from secure backup
4. Restore databases from latest backup (MongoDB → MySQL → Redis → CA keys)
5. Start core infrastructure: Redis → MongoDB → MySQL
6. Start services in dependency order:
   a. discovery-server
   b. certificate-authority
   c. message-manager
   d. api-gateway
   e. audit-logger, dlq-service
   f. financial-scraper, trader-trainer
   g. admin-interface
7. Verify health endpoints for all services
8. Verify service registration in discovery-server

### Recovery Verification

After any recovery, run:

```bash
# Check all services are registered
curl -k https://localhost:8443/services

# Check core service health
for svc in discovery-server message-manager api-gateway certificate-authority; do
  curl -sk --cert /certs/server.crt --key /certs/server-key.pem \
    https://localhost:8443/v1/$svc/health
done
```

## Backup Verification (CI/CD)

A weekly GitHub Actions workflow tests restore readiness:
`.github/workflows/backup-test.yml`

- Runs every Sunday at 6:00 AM
- Validates syntax of all 4 backup/restore scripts
- Tests dry-run mode for restore.sh
- Validates K8s CronJob manifest
- Validates backup directory structure

Results are visible in the GitHub Actions tab. On failure, the workflow
annotates the commit with details.

## Ownership

- Backup automation: DevOps / Platform team
- Restore procedure validation: SRE team (quarterly)
- Secrets rotation: Security team (quarterly)
- DR drill coordination: Engineering manager (bi-annual)
- Backup CI/CD: GitHub Actions (`.github/workflows/backup-test.yml`)
