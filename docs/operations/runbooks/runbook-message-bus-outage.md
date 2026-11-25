# Runbook: Message Bus Outage

**Alerts:** `ServiceDown` on `message-manager`, `MessageDeliveryLowSuccessRate`, `BusDeadLetters`, `MessagesUnrouted`, `JournalBacklogOld`, `JournalEntriesTrimmed`  
**Severity:** L1

## Architecture Context

message-manager is an HTTP pub/sub broker with a durable Redis Streams journal ([ADR-0048](../../adr/0048-durable-message-journal-in-redis-streams.md)). Know its limits before acting:

- **A publish is answered (202) once the message is in the journal** (one Redis stream per topic, one consumer group per subscriber service, key `trading-model:message-manager:journal:<topic>`); the workers of every replica deliver and retry afterwards. A stop or a crash of a replica loses nothing: another replica claims its pending entries within about 30 s. Messages accepted for a service that does not subscribe wait for it up to 24 h. The journal is Redis state with no backup: AOF and replication protect it, so a Redis outage stops publishing (503) and losing Redis with its replicas loses what was not delivered yet. Inspect a backlog with `XPENDING <journal key> <service>`; never `KEYS`.
- **Subscriptions live in Redis** (one hash per topic, `REDIS_SENTINELS`), expire 60 s after their last renewal, and subscribers renew every 15 s. Without Redis, message-manager cannot route anything.
- **A message published on a topic with no journal group is dropped** and counted (`mm_messages_unrouted_total`) (`delivery.requireSubscriber` refuses it with 503 instead; no publisher sets it since the trainer stopped subscribing, #1252).
- **Dead letters go to the Redis dead stream of their topic** (ADR-0073, section 4 below). While Redis cannot take one, or while a subscriber's circuit breaker is open, the message stays pending in the journal and is retried (no local file): it is only lost if it stays pending past the 24 h trim (`JournalEntriesTrimmed`).

An outage affects:

- audit-logger (receives no events: gap in the audit trail)

## Detection

- `ServiceDown`: message-manager not scraped.
- `MessageDeliveryLowSuccessRate`: more than 0.5 % of messages dead-lettered over 5 min.
- `BusDeadLetters`: a dead stream holds entries waiting for an operator.
- `MessagesUnrouted`: a topic has had no journal group for 10 min.
- `JournalBacklogOld`: a subscriber has not acknowledged an entry for 15 min (see 6).
- `JournalEntriesTrimmed`: undelivered journal entries were trimmed after 24 h: messages lost (see 5).
- Publishers log timeouts or connection errors to message-manager.

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
  node -e "$SVID_GET" https://localhost:3000/health/ready
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

**Symptoms:** `MessageDeliveryLowSuccessRate`, `BusDeadLetters` on one topic, publishers slow (they wait for the retries: up to 10 attempts, 20 s cap, ~4.3 min at worst; the publish times out after 5 min).  
**Check:**

```bash
kubectl exec -n trading-model deployment/message-manager -c message-manager -- \
  node -e "$SVID_GET" https://localhost:3000/metrics | grep -E 'mm_subscriber_delivery_concurrency|mm_circuit_breaker_state|mm_messages_dlq_total'
```

**Fix:** restore the subscriber named by the metrics (its own runbook). While its circuit breaker is open, its messages go straight to the dead-letter file.

### 3. No subscriber on a topic

**Symptoms:** `MessagesUnrouted` on a topic: it has no group, so no service ever subscribed (a service that is only absent keeps its group, its messages wait up to 24 h).
**Fix:** check that the subscribing service is up and that its logs show no subscription error (403 from the message-manager ACL, Redis errors). audit-logger subscribes to the audit, training and dlq topics: if all of them are unrouted, look at audit-logger and at Redis first.

### 4. Dead letters stuck, refused or lost

**Symptoms:** `BusDeadLetters` (warning). A dead letter is an entry of the stream `trading-model:message-manager:dead:<topic>` with its group, attempts and reason (ADR-0073). While Redis refuses the write, the journal entry stays pending (`JournalBacklogOld` after 15 min, see 6); message-manager logs the cause.

**Inspect, replay, delete** (inside an audit-logger pod; `<operator>` is recorded as the actor of the `dlq.*` audit event):

```
node services/audit-logger/dist/application/dlq-cli.js <operator> list <topic>
node services/audit-logger/dist/application/dlq-cli.js <operator> replay <topic> <id>...
node services/audit-logger/dist/application/dlq-cli.js <operator> delete <topic> <id>...
```

A replay gives the entry back to the one group that failed, under its own `messageId`, then removes it from the dead stream. Fix the cause first (a payload the subscriber refuses, a schema drift), or it is dead-lettered again. Each new dead letter of a topic purges the entries of that dead stream older than 7 days (ADR-0073 §4): replay or delete within a week, or the message is lost (its `dlq.entry.added` audit event stays). The alert stays until the dead streams are empty.

### 5. Journal entries trimmed before delivery

**Symptoms:** `JournalEntriesTrimmed` (critical) with `topic` and `service`; message-manager logs `Journal entry trimmed before delivery: message lost` with the entry id.
**Cause:** `service` did not receive its messages for more than 24 h (ADR-0048). They are gone from the journal and not dead-lettered. Only the named `service` is affected: the other groups of the topic keep their own entries.
**Fix:** bring `service` back up. Then recover what it missed from the source: re-scrape the candles for `market.*` topics; for `audit-logger`, accept the gap and run `chain-cli.js acknowledge-loss` if its chain reports a loss (runbook-audit-chain-broken).

### 6. Journal backlog of a subscriber

**Symptoms:** `JournalBacklogOld` (warning) with `topic` and `service`: the oldest entry that `service` has not acknowledged is more than 15 min old (`mm_journal_oldest_pending_age_seconds`; `mm_journal_pending_entries` is the size of the backlog, unread entries included). Hours before the 24 h trim of 6.
**Cause:** `service` is down or refuses the callback, or its circuit breaker is open in message-manager (`mm_circuit_breaker_state`).
**Fix:** check `service` (health, logs) and the message-manager delivery logs for it. Once it answers, the backlog drains by itself, oldest first; both gauges fall. Past 24 h the entries are lost (6).

**Retired topic or a service that dropped a topic (issue #2479):** a consumer group lives until an operator removes it (ADR-0073 §2), so its backlog never drains. A topic no longer in the contracts (`EVENT_VALIDATORS`) leaves the gauges by itself, and a service's consumer reports only the topics it consumes. The group and its stream stay in Redis. Remove them by hand once the code without the topic runs everywhere (no N-1 left that publishes or reads it). Run this in the Redis master as the ACL user `message-manager`, once per group of the topic:

```sh
P=trading-model:message-manager
redis-cli --user message-manager XGROUP DESTROY "$P:journal:<topic>" <service>
redis-cli --user message-manager SREM "$P:journal-groups" "<topic>|<service>"
```

The undelivered entries of that group are lost. A group of a live topic that a subscriber still declares is recreated at its next start: remove it only after that service stopped consuming the topic.

## Recovery Verification

```bash
# 1. Readiness
kubectl exec -n trading-model deployment/message-manager -c message-manager -- \
  node -e "$SVID_GET" https://localhost:3000/health/ready

# 2. Subscriptions are back (one hash per topic)
kubectl exec -n trading-model "$REDIS_MASTER" -- redis-cli --scan --pattern 'trading-model:message-manager:subscriptions:*'

# 3. Metrics: mm_messages_delivered_total{status="success"} grows again,
#    mm_messages_unrouted_total stops growing
```

## Prevention

- Run 2+ message-manager replicas with Redis (subscriptions and the journal are shared, see ADR-0048).
- Remember that a restart loses in-flight messages: drain (scale down one replica at a time) rather than delete every pod at once.
