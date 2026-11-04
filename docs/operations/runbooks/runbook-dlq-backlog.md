# Runbook: DLQ Backlog

**Alerts:** `DLQSizeGrowing` (warning), `DLQDrainRateLow` (warning, SLO
`dlq_drain`, target in [slo.md](../slo.md#5-dlq-drain-rate)).

## What the counters mean

message-manager dead-letters a message it could not deliver after its retries
and sends it to dlq-service (signed with `DLQ_AUTH_HMAC_SECRET`). dlq-service
stores it in MongoDB and, with `DLQ_AUTO_RETRY_ENABLED=true` (compose and K8s),
replays eligible entries to message-manager every `DLQ_AUTO_RETRY_INTERVAL_MS`
(30 s), at most `DLQ_AUTO_RETRY_LIMIT` (50) per cycle. An entry that failed
`DLQ_RETRY_MAX_ATTEMPTS` (5) replays is abandoned (kept, no longer retried).

- `dlq_entries_added_total`: entries stored by dlq-service.
- `dlq_entries_replayed_total`: entries replayed with success (auto-retry or
  `POST /dlq/replay`).
- `dlq_entries_replay_failed_total`, `dlq_collection_size`: failed replays,
  entries currently stored.

| Alert | Fires when |
| --- | --- |
| `DLQSizeGrowing` | over 15 min, entries are added faster than they are replayed, for 5 min |
| `DLQDrainRateLow` | over 15 min, less than 80% of the added entries are replayed, for 15 min |

Both read the same two counters: they usually fire together. With nothing
added the ratio is undefined and `DLQDrainRateLow` stays silent. The
dead-lettering itself is `MessagesDeadLettered`, and the path from
message-manager to dlq-service is covered by `DeadLettersNotForwarded`,
`DeadLettersRejected` and `MessagesLost`
([runbook-message-bus-outage](runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost)).

## Symptom

Dead letters pile up in dlq-service instead of being redelivered: the messages
(market data, events for audit-logger) reach their subscribers late or never.

## Diagnosis

```bash
NS=trading-model
# 1. Rates behind the alerts, and the failed replays
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum(rate(dlq_entries_added_total[15m]))'
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum(rate(dlq_entries_replayed_total[15m]))'
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum(rate(dlq_entries_replay_failed_total[15m]))'

# 2. Which topics dead-letter (message-manager side)
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum by (topic) (increase(mm_messages_dlq_total[1h]))'

# 3. Is auto-retry running, and why replays fail
kubectl -n $NS get configmap dlq-service-config -o jsonpath='{.data.DLQ_AUTO_RETRY_ENABLED}{"\n"}'
kubectl -n $NS logs deploy/dlq-service --tail=300 | grep -iE "auto-retry|replay|abandoned"

# 4. dlq-service health (mTLS only: use its SVID)
kubectl exec -n $NS deployment/dlq-service -c dlq-service -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/health
```

List the entries through the gateway with `examples/manage-dlq.sh` (gateway API
key + `DLQ_AUTH_HMAC_SECRET`, caller `admin`): `signed_curl GET
'/dlq?topic=<topic>&limit=50'`.

Common causes:

1. **The subscriber is still failing**: a replay goes back through
   message-manager to the same subscriber, fails again and is dead-lettered
   again (added grows with replayed failing). Step 2 names the topic; fix the
   subscriber first ([runbook-message-bus-outage](runbook-message-bus-outage.md#2-slow-or-failing-subscriber)).
2. **Auto-retry disabled or skipped**: `DLQ_AUTO_RETRY_ENABLED` not `true`, or
   the logs show `DLQ auto-retry: cannot resolve message-manager URL, skipping
   cycle` (message-manager not registered in discovery:
   [runbook-discovery](runbook-discovery.md)).
3. **Burst larger than the replay capacity**: a big incident dead-lettered
   thousands of entries; 50 per 30 s cycle drains ~6,000 an hour. The alerts
   clear once the burst is drained.
4. **dlq-service cannot reach MongoDB**: `/health` fails, see
   [runbook-database-failover](runbook-database-failover.md#mongodb-dlq-and-audit-trail).

## Remediation

- Fix the failing subscriber or message-manager first; replaying before that
  only feeds the loop.
- Then drain: auto-retry does it by itself; to go faster, replay by topic
  through the gateway (`signed_curl POST '/dlq/replay?topic=<topic>&limit=100'`
  with `examples/manage-dlq.sh`).
- Abandoned entries (5 failed replays) are never retried: inspect them
  (`GET /dlq`), replay them by hand once the cause is fixed, or delete those
  that are obsolete (`DELETE /dlq` with their ids). Never delete entries of the
  audit topics without checking that audit-logger has them.

## Escalation

Warnings: handle within business hours. Escalate to the Engineering Manager if
the backlog still grows after 4 hours, or if `MessagesLost` fires
(critical, dead letters gone).
