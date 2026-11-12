# Runbook: Message Bus Outage

**Alerts:** `ServiceDown` on `message-manager`, `MessageDeliveryLowSuccessRate`, `MessagesDeadLettered`, `DeadLettersRejected`, `MessagesUnrouted`, `JournalBacklogOld`, `JournalEntriesTrimmed`  
**Severity:** SEV1

## Architecture Context

message-manager is an HTTP pub/sub broker with a durable Redis Streams journal ([ADR-0048](../../adr/0048-durable-message-journal-in-redis-streams.md)). Know its limits before acting:

- **A publish is answered (202) once the message is in the journal** (one Redis stream per topic, one consumer group per subscriber service, key `trading-model:message-manager:journal:<topic>`); the workers of every replica deliver and retry afterwards. A stop or a crash of a replica loses nothing: another replica claims its pending entries within about 30 s. Messages accepted for a service that does not subscribe wait for it up to 24 h. The journal is Redis state with no backup: AOF and replication protect it, so a Redis outage stops publishing (503) and losing Redis with its replicas loses what was not delivered yet. Inspect a backlog with `XPENDING <journal key> <service>`; never `KEYS`.
- **Subscriptions live in Redis** (one hash per topic, `REDIS_SENTINELS`), expire 60 s after their last renewal, and subscribers renew every 15 s. Without Redis, message-manager cannot route anything.
- **A message published with no subscriber is dropped** and counted (`mm_messages_unrouted_total`), except when it sets `delivery.requireSubscriber`: the publish is refused (503) and the publisher keeps it. The scraper candles do (publish cursor): after an outage longer than 60 s the subscriptions have expired, and the candle backlog waits in MySQL until the trainer renews its subscription (15 s) instead of being lost.
- **Dead letters go to dlq-service** (signed `POST /dlq`). While it cannot take one, or while a subscriber's circuit breaker is open, the message stays pending in the journal and is retried (no local file): it is only lost if it stays pending past the 24 h trim (`JournalEntriesTrimmed`).

An outage affects:

- financial-scraper (cannot publish market data)
- trader-trainer (receives no market data)
- audit-logger (receives no events: gap in the audit trail)

## Detection

- `ServiceDown`: message-manager not scraped.
- `MessageDeliveryLowSuccessRate`: more than 0.5 % of messages dead-lettered over 5 min.
- `MessagesDeadLettered`: messages given up, now in dlq-service.
- `DeadLettersRejected`: dlq-service refused dead letters for good.
- `MessagesUnrouted`: a topic has had no subscriber for 10 min.
- `JournalBacklogOld`: a subscriber has not acknowledged an entry for 15 min (see 7).
- `JournalEntriesTrimmed`: undelivered journal entries were trimmed after 24 h: messages lost (see 6).
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

**Symptoms:** `MessagesDeadLettered` (warning: they are in dlq-service, list them with `GET /v1/dlq-service/dlq` and replay with `POST /dlq/replay` through the edge-proxy) or `DeadLettersRejected` (warning). While dlq-service cannot take a dead letter, its journal entry stays pending (`JournalBacklogOld` after 15 min, see 7); message-manager logs the cause.

**dlq-service unavailable:** check that dlq-service is up and ready (`MongoDB`), that message-manager reaches it, and that both read the same `DLQ_AUTH_HMAC_SECRET` (`trading-model-secrets`): a 401 means the secrets differ, a 403 that `message-manager` is missing from `DLQ_ALLOWED_SERVICES`. Once fixed, the pending entries are dead-lettered at their next retry; nothing to copy or replay.

**`DeadLettersRejected`:** dlq-service refused an entry for good (invalid, or a message too large; `mm_dlq_rejected_total`). Its journal entry stays pending, retried and refused again, until the 24 h trim drops it (`JournalEntriesTrimmed`, see 6). Find it from the message-manager logs and the `XPENDING` of the journal (7), and fix the cause (a payload over the dlq-service limit, a schema drift) within 24 h of the alert. Past that the message is lost for good (accepted loss, ADR-0019 §6): recover it from the source as in 6. There is no `.rejected` file any more.

### 5. Scraper publish backlog

**Symptoms:** `fs_unpublished_candles` grows on the collector, `fs_publishes_skipped_total` grows (a publish held up to `PUBLISH_ACCEPT_TIMEOUT_MS`, 15 s), the scraper logs `Previous publish still in flight: skipped` or `Market data publish failed`. MySQL is still fed: the scraper persists before publishing and does not wait for the bus.

Nothing is lost: the candles persisted while the bus is down stay in MySQL past the series publish cursor (`market_publish_cursors`, migration 005) and go out oldest first, 100 per cycle, once message-manager answers again, even after a collector restart. Fix the bus and `fs_unpublished_candles` falls back to 0; until then the trainer lags (`TrainerMarketDataStale` once it has received nothing for 15 min). To skip a backlog on purpose (e.g. after a very long outage, if old candles are not wanted), move the cursor: `UPDATE market_publish_cursors SET published_until = NOW(3) WHERE symbol = '<SYMBOL>'` (UTC session); the skipped candles stay in MySQL only.

### 6. Journal entries trimmed before delivery

**Symptoms:** `JournalEntriesTrimmed` (critical) with `topic` and `service`; message-manager logs `Journal entry trimmed before delivery: message lost` with the entry id.
**Cause:** `service` did not receive its messages for more than 24 h (ADR-0048). They are gone from the journal and not dead-lettered. Only the named `service` is affected: the other groups of the topic keep their own entries.
**Fix:** bring `service` back up. Then recover what it missed from the source: re-scrape the candles for `market.*` topics; for `audit-logger`, accept the gap and run `chain-cli.js acknowledge-loss` if its chain reports a loss (runbook-audit-chain-broken).

### 7. Journal backlog of a subscriber

**Symptoms:** `JournalBacklogOld` (warning) with `topic` and `service`: the oldest entry that `service` has not acknowledged is more than 15 min old (`mm_journal_oldest_pending_age_seconds`; `mm_journal_pending_entries` is the size of the backlog, unread entries included). Hours before the 24 h trim of 6.
**Cause:** `service` is down or refuses the callback, or its circuit breaker is open in message-manager (`mm_circuit_breaker_state`).
**Fix:** check `service` (health, logs) and the message-manager delivery logs for it. Once it answers, the backlog drains by itself, oldest first; both gauges fall. Past 24 h the entries are lost (6).

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

- Run 2+ message-manager replicas with Redis (subscriptions and the journal are shared, see ADR-0048).
- Remember that a restart loses in-flight messages: drain (scale down one replica at a time) rather than delete every pod at once.
