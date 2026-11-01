# Runbook: Message Bus Outage

**Alerts:** `ServiceDown` on `message-manager`, `MessageDeliveryLowSuccessRate`, `MessagesDeadLettered`, `DeadLettersNotForwarded`, `DeadLettersRejected`, `MessagesLost`, `MessagesUnrouted`  
**Severity:** SEV1

## Architecture Context

message-manager is a synchronous HTTP pub/sub broker ([ADR-0019](../../adr/0019-message-broker-as-built.md)). Know its limits before acting:

- **It keeps subscriptions, not messages.** There is no stream, no WAL and no archive: nothing can be replayed. A graceful stop (SIGTERM) leaves discovery, serves 30 s more and lets in-flight publishes finish (up to 5 min, `terminationGracePeriodSeconds: 360`); a crash or a forced kill loses them.
- **Subscriptions live in Redis** (one hash per topic, `REDIS_SENTINELS`), expire 60 s after their last renewal, and subscribers renew every 15 s. Without Redis, message-manager cannot route anything.
- **A message published with no subscriber is dropped** and counted (`mm_messages_unrouted_total`), except when it sets `delivery.requireSubscriber`: the publish is refused (503) and the publisher keeps it. The scraper candles do (publish cursor): after an outage longer than 60 s the subscriptions have expired, and the candle backlog waits in MySQL until the trainer renews its subscription (15 s) instead of being lost.
- **Dead letters go to dlq-service** (signed `POST /dlq`). While it cannot take them they wait in a local file (`DLQ_LOCAL_FALLBACK_PATH`, an `emptyDir` in K8s), sent again every minute and at shutdown: a pod deleted without a graceful stop loses them.

An outage affects:

- financial-scraper (cannot publish market data)
- trader-trainer (receives no market data)
- audit-logger (receives no events: gap in the audit trail)

## Detection

- `ServiceDown`: message-manager not scraped.
- `MessageDeliveryLowSuccessRate`: more than 0.5 % of messages dead-lettered over 5 min.
- `MessagesDeadLettered`: messages given up, now in dlq-service.
- `DeadLettersNotForwarded` / `DeadLettersRejected` / `MessagesLost`: dead letters stuck in a pod, refused by dlq-service, or gone.
- `MessagesUnrouted`: a topic has had no subscriber for 10 min.
- Publishers log timeouts or connection errors to message-manager.
- `MarketDataUnpublished`: candles persisted by the scraper have waited 15 min for the bus (see 5).

## Initial Triage

```bash
# 1. Pods
kubectl get pods -n trading-model -l app.kubernetes.io/component=message-manager

# 2. Redis (subscriptions). Any pod of the HA group can be master: find it
REDIS_MASTER=$(for p in redis-0 redis-1 redis-2; do
  [ "$(kubectl exec -n trading-model "$p" -- redis-cli --raw ROLE | head -n 1)" = master ] && echo "$p"
done)
kubectl exec -n trading-model "$REDIS_MASTER" -- redis-cli ping

# 3. Logs
kubectl logs -n trading-model deployment/message-manager --tail=50

# 4. Readiness (the server demands a client certificate: use the SVID)
kubectl exec -n trading-model deployment/message-manager -c message-manager -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/health/ready
```

## Common Causes

### 1. Redis down

**Symptoms:** readiness fails on `redis`, subscriptions are not saved or read, `MessagesUnrouted` fires.  
**Fix:**

```bash
# Sentinel status: is a master elected?
kubectl exec -n trading-model redis-sentinel-0 -- redis-cli -p 26379 sentinel master mymaster
# If the master is stuck, delete it: sentinel promotes a replica
kubectl delete pod -n trading-model "$REDIS_MASTER"
```

Subscriptions come back on their own within 15 s once Redis answers (subscribers renew). Messages published meanwhile are lost.

### 2. Slow or failing subscriber

**Symptoms:** `MessageDeliveryLowSuccessRate`, `MessagesDeadLettered` on one topic, publishers slow (they wait for the retries: up to 10 attempts, 20 s cap, ~4.3 min at worst; the publish times out after 5 min).  
**Check:**

```bash
kubectl exec -n trading-model deployment/message-manager -c message-manager -- \
  curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/metrics | grep -E 'mm_subscriber_delivery_concurrency|mm_circuit_breaker_state|mm_messages_dlq_total'
```

**Fix:** restore the subscriber named by the metrics (its own runbook). While its circuit breaker is open, its messages go straight to the dead-letter file.

### 3. No subscriber on a topic

**Symptoms:** `MessagesUnrouted` on a topic.  
**Fix:** check that the subscribing service is up and that its logs show no subscription error (403 from the message-manager ACL, Redis errors). audit-logger subscribes to every topic: if every topic is unrouted, look at audit-logger and at Redis first.

### 4. Dead letters stuck, refused or lost

**Symptoms:** `MessagesDeadLettered` (warning: they are in dlq-service, list them with `GET /v1/dlq-service/dlq` and replay with `/dlq/replay` through the edge-proxy), `DeadLettersNotForwarded` (warning), `DeadLettersRejected` (warning) or `MessagesLost` (critical: neither dlq-service nor the file took them).

**`DeadLettersNotForwarded`:** message-manager logs `dlq-service unavailable: dead letter kept locally` with the cause. Check that dlq-service is up and ready (`MongoDB`), that message-manager reaches it, and that both read the same `DLQ_AUTH_HMAC_SECRET` (`trading-model-secrets`): a 401 means the secrets differ, a 403 that `message-manager` is missing from `DLQ_ALLOWED_SERVICES`. Once fixed, the next forward (1 min) empties the file and the alert resolves. **Do not delete the pod before that**, or copy the file first:

```bash
POD=$(kubectl get pods -n trading-model -l app.kubernetes.io/component=message-manager -o name | head -n 1)
kubectl cp -n trading-model -c message-manager \
  "${POD#pod/}:/var/lib/message-manager/dead-letter-queue.jsonl" ./dead-letter-queue.jsonl
```

**`DeadLettersRejected`:** dlq-service refused entries for good (invalid, or a message too large). They are in `/var/lib/message-manager/dead-letter-queue.jsonl.rejected` (copy it the same way) and logged with their topic. Each line is a `DlqEntry`: fix it and submit it with `POST /v1/dlq-service/dlq`.

### 5. Scraper publish backlog

**Symptoms:** `fs_unpublished_candles` grows on the collector, `fs_publishes_skipped_total` grows (a publish held up to `PUBLISH_TIMEOUT_MS`), the scraper logs `Previous publish still in flight: skipped` or `Market data publish failed`. MySQL is still fed: the scraper persists before publishing and does not wait for the bus.

Nothing is lost: the candles persisted while the bus is down stay in MySQL past the series publish cursor (`market_publish_cursors`, migration 005) and go out oldest first, 100 per cycle, once message-manager answers again, even after a collector restart. Fix the bus and `fs_unpublished_candles` falls back to 0; until then the trainer lags (`TrainerMarketDataStale` once it has received nothing for 15 min). To skip a backlog on purpose (e.g. after a very long outage, if old candles are not wanted), move the cursor: `UPDATE market_publish_cursors SET published_until = NOW(3) WHERE symbol = '<SYMBOL>'` (UTC session); the skipped candles stay in MySQL only.

## Recovery Verification

```bash
# 1. Readiness
kubectl exec -n trading-model deployment/message-manager -c message-manager -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/health/ready

# 2. Subscriptions are back (one hash per topic)
kubectl exec -n trading-model "$REDIS_MASTER" -- redis-cli --scan --pattern 'trading-model:message-manager:subscriptions:*'

# 3. Metrics: mm_messages_delivered_total{status="success"} grows again,
#    mm_messages_unrouted_total stops growing
# 4. Market data reaches the trainer: TrainerMarketDataStale resolves
```

## Prevention

- Run 2+ message-manager replicas with Redis (subscriptions are shared, see ADR-0019).
- Remember that a restart loses in-flight messages: drain (scale down one replica at a time) rather than delete every pod at once.
- Sending dead letters to dlq-service instead of a local file is an open follow-up of ADR-0019.
