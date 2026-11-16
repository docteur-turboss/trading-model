# Runbook: Message Bus Outage

**Alerts:** `BusDeadLetters`, `MarketDataUnpublished`  
**Severity:** L1

## Architecture Context

The bus is a library in each service over the shared Redis ([ADR-0073](../../adr/0073-message-bus-as-a-redis-streams-library.md), journal [ADR-0048](../../adr/0048-durable-message-journal-in-redis-streams.md)); there is no broker service to restart. Know its limits before acting:

- **A publish is an `XADD`** to the stream of its topic (key `trading-model:message-manager:journal:<topic>`, one consumer group per subscriber service). It resolves once the entry is in Redis; a Redis outage makes publishers fail, and losing Redis with its replicas loses what was not consumed yet. Inspect a backlog with `XPENDING <journal key> <service>`; never `KEYS`.
- **Each subscriber consumes in process** (`XREADGROUP`), retries with backoff, then writes the entry to the dead stream of the topic. A crashed replica loses nothing: another replica of the group claims its pending entries.
- **Messages for a service that is down wait** in its group, up to the 24 h trim of the journal; past that they are lost.

An outage affects:

- financial-scraper (cannot publish market data)
- trader-trainer (receives no market data)
- audit-logger (receives no events: gap in the audit trail)

## Detection

- `BusDeadLetters`: a dead stream holds entries waiting for an operator.
- `MarketDataUnpublished`: candles persisted by the scraper have waited 15 min for the bus (see 5).
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

Consumers reconnect on their own once Redis answers. Publishes refused meanwhile are retried by the publisher (candles: see 5).

### 2. Subscriber failing or refusing messages

**Symptoms:** `BusDeadLetters` on one topic. The subscriber retries up to 10 times (20 s cap) before dead-lettering.  
**Fix:** read the subscriber logs for the refusal (payload schema, handler error) and fix the cause, then replay (4).

### 3. Backlog of a subscriber

**Symptoms:** `XPENDING <journal key> <service>` shows old entries; the subscriber is down or its handler throws.  
**Fix:** bring the service back; the backlog drains by itself, oldest first. Past 24 h the entries are trimmed and lost: recover what it missed from the source (re-scrape the candles for `market.*` topics; for `audit-logger`, accept the gap and run `chain-cli.js acknowledge-loss` if its chain reports a loss, runbook-audit-chain-broken).

### 4. Dead letters stuck, refused or lost

**Symptoms:** `BusDeadLetters` (warning). A dead letter is an entry of the stream `trading-model:message-manager:dead:<topic>` with its group, attempts and reason (ADR-0073). While Redis refuses the write, the journal entry stays pending (see 3) and the subscriber logs the cause.

**Inspect, replay, delete** (inside an audit-logger pod; `<operator>` is recorded as the actor of the `dlq.*` audit event):

```
node services/audit-logger/dist/application/dlq-cli.js <operator> list <topic>
node services/audit-logger/dist/application/dlq-cli.js <operator> replay <topic> <id>...
node services/audit-logger/dist/application/dlq-cli.js <operator> delete <topic> <id>...
```

A replay gives the entry back to the one group that failed, under its own `messageId`, then removes it from the dead stream. Fix the cause first (a payload the subscriber refuses, a schema drift), or it is dead-lettered again. Dead streams are never trimmed: the alert stays until they are empty.

### 5. Scraper publish backlog

**Symptoms:** `fs_unpublished_candles` grows on the collector, `fs_publishes_skipped_total` grows (a publish held up to `PUBLISH_ACCEPT_TIMEOUT_MS`, 15 s), the scraper logs `Previous publish still in flight: skipped` or `Market data publish failed`. MySQL is still fed: the scraper persists before publishing and does not wait for the bus.

Nothing is lost: the candles persisted while the bus is down stay in MySQL past the series publish cursor (`market_publish_cursors`, migration 005) and go out oldest first, 100 per cycle, once Redis answers again, even after a collector restart. Fix the bus and `fs_unpublished_candles` falls back to 0; until then the scraper publishes lag (the trainer reads MySQL, not the bus). To skip a backlog on purpose (e.g. after a very long outage, if old candles are not wanted), move the cursor: `UPDATE market_publish_cursors SET published_until = NOW(3) WHERE symbol = '<SYMBOL>'` (UTC session); the skipped candles stay in MySQL only.

## Recovery Verification

```bash
# 1. Readiness of the affected service
kubectl exec -n trading-model deployment/<service> --   curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem   https://localhost:3000/health/ready

# 2. Unpublished candles drain: MarketDataUnpublished resolves
```

## Prevention

- Run 2+ replicas of each subscriber: the group redelivers a crashed replica's entries.
- Keep Redis HA (AOF and replicas): the journal has no backup.
