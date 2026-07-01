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

```bash
# Scale down consumer services to prevent spreading corruption
kubectl scale deployment -n trading-model financial-scraper --replicas=0
kubectl scale deployment -n trading-model trader-trainer --replicas=0
```

### 2. Take forensic snapshot

```bash
# MySQL dump
kubectl exec -n trading-model statefulset/mysql -- \
  mysqldump -u root -p financial_scraper > /tmp/corrupted_dump_$(date +%Y%m%d_%H%M%S).sql

# MongoDB dump
kubectl exec -n trading-model mongo-dlq-0 -- \
  mongodump --db dlq --out /tmp/dump_$(date +%Y%m%d_%H%M%S)

# Redis dump (RDB snapshot)
kubectl exec -n trading-model redis-primary-0 -- redis-cli SAVE
```

### 3. Restore from backup

**MySQL:**

```bash
# Find latest known-good backup
ls -la /backups/mysql/

# Restore
kubectl exec -n trading-model statefulset/mysql -i -- \
  mysql -u root -p financial_scraper < /backups/mysql/clean_<date>.sql

# Verify data integrity
kubectl exec -n trading-model statefulset/mysql -- \
  mysqlcheck -u root -p --check financial_scraper
```

**MongoDB:**

```bash
# Find latest known-good backup
ls -la /backups/mongodb/

# Restore
mongorestore --host mongo-dlq-0.mongo-dlq-headless:27017 \
  --drop /backups/mongodb/clean_<date>/

# Verify
kubectl exec -n trading-model deployment/dlq-service -- \
  curl -sk https://localhost:3000/dlq | head -20
```

**Redis:**
Redis data is ephemeral and can be rebuilt. If corruption is detected:

```bash
kubectl exec -n trading-model redis-primary-0 -- redis-cli FLUSHALL
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
