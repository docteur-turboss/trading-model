# Runbook: Database Failover

## MySQL Failover

**Alert:** `ServiceDown` on `financial-scraper` with MySQL connectivity errors  
**Severity:** SEV1-SEV2

### Symptom Check
```bash
# Check MySQL pod status
kubectl exec -n trading-model statefulset/mysql -- mysqladmin ping -h localhost -u root -p

# Check MySQL error log
kubectl logs -n trading-model statefulset/mysql --tail=50

# Check financial-scraper logs for DB errors
kubectl logs -n trading-model deployment/financial-scraper --tail=20 | grep -i "mysql\|db\|database"
```

### Recovery

**If MySQL pod is running but slow:**
```bash
# Restart MySQL pod (StatefulSet)
kubectl delete pod -n trading-model mysql-0

# The StatefulSet will recreate it with the same PVC
```

**If MySQL PVC is corrupted:**
1. Scale down financial-scraper to prevent writes:
   ```bash
   kubectl scale deployment -n trading-model financial-scraper --replicas=0
   ```
2. Restore from latest backup:
   ```bash
   # Find latest MySQL dump in backup storage
   # Restore
   mysql -h <restored-host> -u root -p financial_scraper < backup_<date>.sql
   ```
3. Point financial-scraper to restored DB:
   ```bash
   kubectl set env deployment -n trading-model financial-scraper DB_HOST=<restored-host>
   ```
4. Scale up financial-scraper:
   ```bash
   kubectl scale deployment -n trading-model financial-scraper --replicas=2
   ```

## MongoDB Failover (DLQ + Audit)

**Alert:** `ServiceDown` on `dlq-service` or `audit-logger`  
**Severity:** SEV1

### Symptom Check
```bash
# Check replica set status
kubectl exec -n trading-model mongo-dlq-0 -- mongosh --quiet --eval "rs.status()"

# Check which node is primary
kubectl exec -n trading-model mongo-dlq-0 -- mongosh --quiet --eval "rs.isMaster()"
```

### Recovery
MongoDB replica set should auto-failover. If it does not:
```bash
# Force re-election
kubectl exec -n trading-model mongo-dlq-0 -- mongosh --quiet --eval "rs.stepDown()"

# If a member is unreachable, remove and re-add:
kubectl exec -n trading-model mongo-dlq-0 -- mongosh --quiet --eval "rs.remove('mongo-dlq-2.mongo-dlq-headless:27017')"
# After node recovers:
kubectl exec -n trading-model mongo-dlq-0 -- mongosh --quiet --eval "rs.add('mongo-dlq-2.mongo-dlq-headless:27017')"
```

### Full data loss
1. Restore from latest mongodump backup:
   ```bash
   mongorestore --host <restored-host> --drop backup_<date>/
   ```
2. Verify data integrity:
   ```bash
   kubectl exec -n trading-model deployment/dlq-service -- curl -sk https://localhost:3000/dlq
   ```

## Redis Failover

**Alert:** Multiple services showing degraded performance  
**Severity:** SEV1-SEV2

### Symptom Check
```bash
# Check Redis primary
kubectl exec -n trading-model redis-primary-0 -- redis-cli ping

# Check sentinel status
kubectl exec -n trading-model redis-sentinel-0 -- redis-cli -p 26379 sentinel masters
```

### Recovery
Redis Sentinel should auto-failover. If not:
```bash
# Force sentinel failover
kubectl exec -n trading-model redis-sentinel-0 -- redis-cli -p 26379 sentinel failover mymaster
```

### Full Redis data loss
Redis will rebuild from AOF/RDB on restart. If persistence is corrupted:
1. Clear Redis data:
   ```bash
   kubectl exec -n trading-model redis-primary-0 -- redis-cli FLUSHALL
   ```
2. Services will reconnect and rebuild cache
3. Monitor message-manager for backpressure during rebuild

## Post-Recovery

- [ ] Verify all services show healthy
- [ ] Run E2E smoke tests
- [ ] Check Prometheus alerts resolve
- [ ] Document root cause
- [ ] Update backup retention if needed
