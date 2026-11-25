# Runbook: Message Bus Outage

**Alerts:** `MessageDeliveryLowSuccessRate`, `BusDeadLetters`, `MessagesUnrouted`, `JournalBacklogOld`, `JournalEntriesTrimmed`  
**Severity:** L1

## Architecture Context

The bus is a library in each service over the shared Redis ([ADR-0073](../../adr/0073-message-bus-as-a-redis-streams-library.md), journal [ADR-0048](../../adr/0048-durable-message-journal-in-redis-streams.md)); there is no broker service to restart. Know its limits before acting:

- **A publish is an `XADD`** to the stream of its topic (key `trading-model:message-manager:journal:<topic>`, one consumer group per subscriber service). It resolves once the entry is in Redis; a Redis outage makes publishers fail, and losing Redis with its replicas loses what was not consumed yet. Inspect a backlog with `XPENDING <journal key> <service>`; never `KEYS`.
- **Each subscriber consumes in process** (`XREADGROUP`), retries with backoff, then writes the entry to the dead stream of the topic. A crashed replica loses nothing: another replica of the group claims its pending entries.
- **Messages for a service that is down wait** in its group, up to the 24 h trim of the journal; past that they are lost.

An outage affects:

- audit-logger (receives no events: gap in the audit trail)

## Detection

- `MessageDeliveryLowSuccessRate`: more than 0.5 % of messages dead-lettered over 5 min.
- `BusDeadLetters`: a dead stream holds entries waiting for an operator.
- `MessagesUnrouted`: a topic has had no subscriber for 10 min (see 6).
- `JournalBacklogOld`: a subscriber has not acknowledged an entry for 15 min (see 3).
- `JournalEntriesTrimmed`: undelivered journal entries were trimmed after 24 h: messages lost (see 5).
- Publishers log connection errors to Redis.

## Initial Triage

```bash
# 1. Redis. Any pod of the HA group can be master: find it
REDIS_MASTER=$(for p in redis-0 redis-1 redis-2; do
  [ "$(kubectl exec -n trading-model "$p" -- redis-cli --raw ROLE | head -n 1)" = master ] && echo "$p"
done)
kubectl exec -n trading-model "$REDIS_MASTER" -- redis-cli ping

# 2. Logs of the publisher or subscriber
kubectl logs -n trading-model deployment/<service> --tail=50
```

## Common Causes

### 1. Redis down

**Symptoms:** publishers and subscribers log Redis errors, readiness fails on `redis`.  
**Fix:**

```bash
# Sentinel status: is a master elected?
kubectl exec -n trading-model redis-sentinel-0 -- redis-cli -p 26379 sentinel master mymaster
# If the master is stuck, delete it: sentinel promotes a replica
kubectl delete pod -n trading-model "$REDIS_MASTER"
```

Consumers reconnect on their own once Redis answers. Publishes refused meanwhile fail at the publisher, which logs them.

### 2. Subscriber failing or refusing messages

**Symptoms:** `BusDeadLetters` on one topic. The subscriber retries up to 10 times (20 s cap) before dead-lettering.  
**Fix:** read the subscriber logs for the refusal (payload schema, handler error) and fix the cause, then replay (4).

### 3. Backlog of a subscriber

**Symptoms:** `XPENDING <journal key> <service>` shows old entries; the subscriber is down or its handler throws.  
**Fix:** bring the service back; the backlog drains by itself, oldest first. Past 24 h the entries are trimmed and lost: recover what it missed from the source (re-scrape the candles for `market.*` topics; for `audit-logger`, accept the gap and run `chain-cli.js acknowledge-loss` if its chain reports a loss, runbook-audit-chain-broken).

**Retired topic or a service that dropped a topic (issue #2479):** a consumer group lives until an operator removes it (ADR-0073 §2), so its backlog never drains. A topic no longer in the contracts (`EVENT_VALIDATORS`) leaves the gauges by itself, and a service's consumer reports only the topics it consumes. The group and its stream stay in Redis. Remove them by hand once the code without the topic runs everywhere (no N-1 left that publishes or reads it). Run this in the Redis master as the ACL user `message-manager` (kept until issue #2619), once per group of the topic:

```sh
P=trading-model:message-manager
redis-cli --user message-manager XGROUP DESTROY "$P:journal:<topic>" <service>
redis-cli --user message-manager SREM "$P:journal-groups" "<topic>|<service>"
```

The undelivered entries of that group are lost. A group of a live topic that a subscriber still declares is recreated at its next start: remove it only after that service stopped consuming the topic.

### 4. Dead letters stuck, refused or lost

**Symptoms:** `BusDeadLetters` (warning). A dead letter is an entry of the stream `trading-model:message-manager:dead:<topic>` with its group, attempts and reason (ADR-0073). While Redis refuses the write, the journal entry stays pending (see 3) and the subscriber logs the cause.

**Inspect, replay, delete** (inside an audit-logger pod; `<operator>` is recorded as the actor of the `dlq.*` audit event):

```
node services/audit-logger/dist/application/dlq-cli.js <operator> list <topic> [after]
node services/audit-logger/dist/application/dlq-cli.js <operator> replay <topic> <id>...
node services/audit-logger/dist/application/dlq-cli.js <operator> delete <topic> <id>...
```

`list` prints 100 entries at most: pass the id of the last one as `after` to read the next page. A replay gives the entry back to the one group that failed, under its own `messageId`, then removes it from the dead stream. Fix the cause first (a payload the subscriber refuses, a schema drift), or it is dead-lettered again. Each new dead letter of a topic purges the entries of that dead stream older than 7 days (ADR-0073 §4): replay or delete within a week, or the message is lost (its `dlq.entry.added` audit event stays). The alert stays until the dead streams are empty.

### 5. Journal entries trimmed before delivery

**Symptoms:** `JournalEntriesTrimmed` (critical) with `topic` and `service`; the subscriber logs `Journal entry trimmed before delivery: message lost` with the entry id.
**Cause:** `service` did not receive its messages for more than 24 h (ADR-0048). They are gone from the journal and not dead-lettered. Only the named `service` is affected: the other groups of the topic keep their own entries.
**Fix:** bring `service` back up. Then recover what it missed from the source: re-scrape the candles for `market.*` topics; for `audit-logger`, accept the gap and run `chain-cli.js acknowledge-loss` if its chain reports a loss (runbook-audit-chain-broken).

### 6. No subscriber on a topic

**Symptoms:** `MessagesUnrouted` (warning) with `topic`: publishers drop the messages of a topic no service subscribed to (counted in `mm_messages_unrouted_total`, logged `Message dropped: no subscriber for its topic`). A service that is only down keeps its group, so its messages wait up to 24 h instead.
**Fix:** check that the subscribing service is up and that its logs show no subscription or Redis error. audit-logger subscribes to the audit and training topics: if all of them are unrouted, look at audit-logger and Redis first.

## Recovery Verification

```bash
# 1. Readiness of the affected service
kubectl exec -n trading-model deployment/<service> -- node -e "$SVID_GET" https://localhost:3000/health/ready

# 2. Pending entries drain: `XPENDING <journal key> <service>` falls to 0, JournalBacklogOld resolves
```

## Prevention

- Run 2+ replicas of each subscriber: the group redelivers a crashed replica's entries.
- Keep Redis HA (AOF and replicas): the journal has no backup.
