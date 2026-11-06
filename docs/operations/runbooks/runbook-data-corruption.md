# Runbook: Data Corruption

**Severity:** SEV1 (if detected)  
**Alert:** Manual detection or anomaly in data

## Detection

- Financial scraper returns inconsistent market data
- Audit logger shows gap in event sequence
- DLQ messages have unparseable payloads
- MySQL checksum mismatch
- MongoDB replica set inconsistency

## Immediate Response

### 1. Isolate the affected data

Stop every writer of the database you will restore (the SPIRE server too for
MySQL: it writes into the `spire` schema). Note the replica counts first, to
scale back to them afterwards.

```bash
kubectl get deployment -n trading-model -o wide   # note the replica counts
# MySQL: market data and SPIRE datastore
kubectl scale deployment -n trading-model financial-scraper financial-scraper-collector spire-server --replicas=0
# MongoDB DLQ
kubectl scale deployment -n trading-model dlq-service --replicas=0
# MongoDB audit trail
kubectl scale deployment -n trading-model audit-logger --replicas=0
```

`trader-trainer` and `message-manager` do not write these databases but read
what is corrupted: scale `trader-trainer` to 0 as well while market data is
suspect.

### 2. Take forensic snapshot

MySQL runs only on `mysql-0` (behind `mysql-primary`, ADR-0020): never use
`statefulset/mysql`, which can pick `mysql-1/2`, empty. Run the dumps
**before** the restore: the restore overwrites the corrupted data.

```bash
# MySQL dump (root password from the container's own environment)
kubectl exec -n trading-model mysql-0 -c mysql --   sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" financial_scraper'   > corrupted_mysql_$(date +%Y%m%d_%H%M%S).sql

# MongoDB dumps stay inside the pod (/tmp): copy them out with kubectl cp
kubectl exec -n trading-model mongo-dlq-0 -c mongodb --   mongodump --db dlq --out /tmp/dump_$(date +%Y%m%d_%H%M%S)
kubectl exec -n trading-model mongo-audit-0 -c mongodb --   mongodump --db audit --out /tmp/dump_audit_$(date +%Y%m%d_%H%M%S)

# Redis dump (RDB snapshot)
# Any pod of the Redis HA group can be master: find the current one
REDIS_MASTER=$(for p in redis-0 redis-1 redis-2; do
  [ "$(kubectl exec -n trading-model "$p" -- redis-cli --raw ROLE | head -n 1)" = master ] && echo "$p"
done)
kubectl exec -n trading-model "$REDIS_MASTER" -- redis-cli SAVE
```

The forensic dumps are plaintext and hold market data: keep them on an
encrypted disk and delete them once the investigation is closed.

### 3. Restore from backup

Backups are age-encrypted (`*.age`), chosen from the run manifest and restored
only by `scripts/restore-k8s.sh`. Never restore a plaintext dump by hand
(`mysql < file.sql`, `mongorestore` on a directory). Prerequisites (age key,
workstation or in-cluster, `mysqlbinlog` for `--until`) and the fetch of a run
from the off-site bucket with `scripts/fetch-offsite.sh`:
[runbook-database-failover.md, Before any restore](runbook-database-failover.md#before-any-restore) and
[BACKUP_DR.md, Restore Procedures](../../deployment/BACKUP_DR.md#restore-procedures).
Variables below as in those documents: `BACKUP_DIR=./restore`,
`K8S_NAMESPACE=trading-model`, `BACKUP_AGE_IDENTITY=~/backup-key.txt`.

**Pick the instant.** Corruption has a start: restore the state just before it
with `--until <instant>` (UTC, the instant itself excluded). It needs the
archives of the last 72 h (ADR-0031). Older than that, no `--until`: use the
newest daily run taken before the corruption with `--timestamp <TS>`.

**MySQL** (`financial_scraper` and the `spire` schema share one volume, the
whole instance is restored, never one table):

```bash
bash scripts/fetch-offsite.sh --dest ./restore --pitr
BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt   bash scripts/restore-k8s.sh --until 2026-11-03T13:45:00Z --components mysql,spire
```

- Writers must be stopped (step 1), SPIRE server included: `restore-k8s.sh`
  scales it to 0 only in its SPIRE step, after MySQL.
- `--components mysql,spire` restores MySQL before the SPIRE CA keys, as the
  datastore and the keys must come from the same run. Details and the
  empty-volume case:
  [runbook-database-failover.md, MySQL volume lost or corrupted](runbook-database-failover.md#mysql-volume-lost-or-corrupted-restore).
- `--ns` and `--into-scratch` do not exist for MySQL. To recover a few rows,
  restore on a staging cluster and copy them by hand.

**MongoDB DLQ** (component `mongodb`, database `dlq`):

```bash
# One collection, in place; the audit trail is left alone
BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt   bash scripts/restore-k8s.sh --components mongodb --ns 'dlq.dead_letters'
# Same collection into the scratch database restore_<TS>_dlq, original untouched
BACKUP_DIR=./restore K8S_NAMESPACE=trading-model BACKUP_AGE_IDENTITY=~/backup-key.txt   bash scripts/restore-k8s.sh --components mongodb --ns 'dlq.dead_letters' --into-scratch
```

- `--ns` data is as of the start of the dump, and `--until` is refused with
  it. Never use `--until` with `mongodb` for a DLQ problem: it also rewinds the
  audit trail.
- Use `--into-scratch` when only some documents are corrupted: compare, copy
  the healthy ones back, then drop the scratch databases. Details:
  [BACKUP_DR.md, Restoring part of MongoDB](../../deployment/BACKUP_DR.md#restoring-part-of-mongodb---ns---into-scratch).
- Whole `dlq` database: [runbook-database-failover.md, Full data loss: DLQ](runbook-database-failover.md#full-data-loss-dlq).
- Verify: `/dlq` needs an HMAC signature on top of mTLS, so go through the
  gateway with `examples/manage-dlq.sh` (gateway API key +
  `DLQ_AUTH_HMAC_SECRET`):

```bash
kubectl port-forward -n trading-model svc/edge-proxy 8449:8080 &
API_GATEWAY=http://localhost:8449 ADMIN_TOKEN=<AUTH_TOKENS value>   DLQ_AUTH_HMAC_SECRET=<dlq-service secret>   bash examples/manage-dlq.sh | head -20
```

**MongoDB audit trail** (`mongo-audit`, hash chain anchored in S3, ADR-0027):
never edit `audit_events` / `audit_chain_state` by hand and never restore part
of `audit.*` in place (`restore-k8s.sh` refuses it). Use `--into-scratch` to
inspect, or restore the whole replica set with `--components mongodb-audit`
(with or without `--until`). The events written after the restored point are
lost: `AuditChainBroken` fires, then acknowledge the loss with
`chain-cli.js acknowledge-loss` as in
[runbook-audit-chain-broken.md, After a restore from an older backup](runbook-audit-chain-broken.md#after-a-restore-from-an-older-backup).
Procedure: [runbook-database-failover.md, Full data loss: audit trail](runbook-database-failover.md#full-data-loss-audit-trail-mongo-audit).

**Verify and resume:**

```bash
K8S_NAMESPACE=trading-model bash scripts/verify-restore-k8s.sh   # exit 1 on any KO
kubectl scale deployment -n trading-model <deployment> --replicas=<noted count>
```

Scale back every deployment stopped in step 1, to the counts noted there.

**Redis:**
Redis data is ephemeral and can be rebuilt. If corruption is detected:

```bash
kubectl exec -n trading-model "$REDIS_MASTER" -- redis-cli FLUSHALL
# Services will repopulate cache from source data
```

## Root Cause Investigation

### Database corruption causes:

1. Hardware failure (disk errors)
2. Software bug in write path
3. Concurrent write conflict
4. Incomplete transaction (crash during write)
5. Malicious data injection

### Check for software bugs:

```bash
# Check service logs around corruption time window
kubectl logs -n trading-model deployment/financial-scraper \
  --since=<corruption-detection-time - 1h> | grep -i "error\|warn\|exception"
```

## Prevention

- Enable MySQL `innodb_checksum_algorithm=crc32`
- MongoDB default checksums on WiredTiger
- Redis RDB persistence (900s + 300s checkpoints)
- Regular backup verification (monthly test restores)
- Database health monitoring in Prometheus
