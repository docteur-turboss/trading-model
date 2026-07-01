# Runbook: Message Bus Outage

**Alert:** `ServiceDown` on `message-manager`, `BackpressureHigh`, `DLQSizeGrowing`  
**Severity:** SEV1

## Architecture Context
The message bus (message-manager) is the central event backbone. All services depend on it for inter-service communication. An outage affects:
- financial-scraper (cannot publish market data)
- trader-trainer (cannot receive market data)
- audit-logger (cannot ingest events)
- dlq-service (cannot receive DLQ entries from message-manager)

## Detection
- Prometheus alerts: `ServiceDown`, `BackpressureHigh`, `DLQSizeGrowing`
- Grafana: message-manager dashboard showing queue depth, consumer lag
- Services report connection refused or timeout to message-manager

## Initial Triage

```bash
# 1. Check message-manager pods
kubectl get pods -n trading-model -l app.kubernetes.io/component=message-manager

# 2. Check Redis connectivity (message-manager depends on Redis)
kubectl exec -n trading-model redis-primary-0 -- redis-cli ping

# 3. Check message-manager logs
kubectl logs -n trading-model deployment/message-manager --tail=50

# 4. Check health endpoint
kubectl exec -n trading-model deployment/message-manager -- \
  curl -sk https://localhost:3000/health/ready
```

## Common Causes

### 1. Redis Down
**Symptoms:** message-manager cannot connect to Redis, all delivery stops  
**Fix:**
```bash
# Restart Redis primary
kubectl delete pod -n trading-model redis-primary-0

# If sentinel is active, it will auto-failover to replica
# Check sentinel status
kubectl exec -n trading-model redis-sentinel-0 -- redis-cli -p 26379 sentinel master mymaster
```

### 2. Backpressure from slow subscribers
**Symptoms:** `BackpressureHigh` alert, high queue depth  
**Check:**
```bash
# Check subscriber delivery concurrency
kubectl exec -n trading-model deployment/message-manager -- \
  curl -sk https://localhost:3000/metrics | grep subscriber_delivery_concurrency

# Check which topics have the most backlog
kubectl exec -n trading-model deployment/message-manager -- \
  curl -sk https://localhost:3000/metrics | grep redis_stream_size
```
**Fix:**
```bash
# Scale up message-manager
kubectl scale deployment -n trading-model message-manager --replicas=5

# OR increase delivery concurrency (env var)
kubectl set env deployment -n trading-model message-manager MAX_CONCURRENT_DELIVERIES=1000
```

### 3. DLQ Service Down
**Symptoms:** Messages failing delivery, DLQ buffer filling up  
**Check:**
```bash
kubectl get pods -n trading-model -l app.kubernetes.io/component=dlq-service
```
**Fix:** Restore DLQ service first, then message-manager will drain DLQ buffer.

### 4. WAL Corruption
**Symptoms:** message-manager crash loop with WAL errors  
**Fix:**
```bash
# Scale down to stop writes
kubectl scale deployment -n trading-model message-manager --replicas=0

# Check Redis stream health
kubectl exec -n trading-model redis-primary-0 -- redis-cli XLEN mm:stream:0

# Clear WAL state (if safe to lose in-flight messages)
kubectl exec -n trading-model redis-primary-0 -- redis-cli DEL mm:wal

# Scale up
kubectl scale deployment -n trading-model message-manager --replicas=3
```

## Recovery Verification

```bash
# 1. Health check
kubectl exec -n trading-model deployment/message-manager -- \
  curl -sk https://localhost:3000/health/ready

# 2. Publish test message
kubectl exec -n trading-model deployment/message-manager -- \
  curl -sk -X POST https://localhost:3000/publish \
  -H 'Content-Type: application/json' \
  -d '{"topic":"example.show.create","payload":{"debug":true}}'

# 3. Check metrics recover
# 4. Verify dependent services reconnected
# 5. Check DLQ is draining
```

## Prevention
- Configure HPA to scale message-manager before backpressure builds
- Set `MAX_CONCURRENT_DELIVERIES` proportional to expected subscriber count
- Monitor Redis stream lag as leading indicator
- Ensure DLQ service is independently HA (2+ replicas)
