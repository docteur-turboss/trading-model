# Runbook: DLQ Backlog

**Alert:** `DlqAuditEventLost` (critical), see below. The backlog of historical
entries has no alert.

## What the counters mean

Since ADR-0073, new dead letters go to the Redis dead streams, not to
dlq-service: list, replay and delete them with `audit-dlq` (see
[runbook-message-bus-outage](runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost)).
dlq-service only keeps its historical MongoDB entries (readable, replayable
and deletable through the API). There is no auto-retry any more. An entry that
failed `DLQ_RETRY_MAX_ATTEMPTS` replays is abandoned (kept, no longer retried).

- `dlq_entries_replayed_total`: entries replayed with success (`POST /v1/dlq-service/dlq/replay`).
- `dlq_entries_replay_failed_total`, `dlq_collection_size`: failed replays,
  entries currently stored.

Dead-lettering itself and the path from message-manager
to the dead streams are covered by `BusDeadLetters`
([runbook-message-bus-outage](runbook-message-bus-outage.md#4-dead-letters-stuck-refused-or-lost)).

## Symptom

Dead letters pile up in dlq-service instead of being redelivered: the messages
(market data, events for audit-logger) reach their subscribers late or never.

## Diagnosis

```bash
NS=trading-model
# 1. Replays and failed replays
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum(rate(dlq_entries_replayed_total[15m]))'
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum(rate(dlq_entries_replay_failed_total[15m]))'

# 2. Why replays fail
kubectl -n $NS logs deploy/dlq-service --tail=300 | grep -iE "replay|abandoned"

# 3. dlq-service health (mTLS only: use its SVID)
kubectl exec -n $NS deployment/dlq-service -c dlq-service -- \
  node -e "$SVID_GET" https://localhost:3000/health
```

List the entries through the gateway with `examples/manage-dlq.sh` (gateway API
key + `DLQ_AUTH_HMAC_SECRET`, caller `admin`): `signed_curl GET
'/dlq?topic=<topic>&limit=50'`.

Common causes:

1. **The subscriber is still failing**: a replay goes back through
   message-manager to the same subscriber, fails again and is dead-lettered
   again. The replay logs name the topic; fix the
   subscriber first ([runbook-message-bus-outage](runbook-message-bus-outage.md#2-slow-or-failing-subscriber)).
2. **Historical entries nobody replays**: with auto-retry gone, stored entries
   stay until an operator replays or deletes them.
3. **dlq-service cannot reach MongoDB**: `/health` fails, see
   [runbook-database-failover](runbook-database-failover.md#mongodb-dlq-and-audit-trail).

## Remediation

- Fix the failing subscriber or message-manager first; replaying before that
  only feeds the loop.
- Then drain: replay by topic
  through the gateway (`signed_curl POST '/dlq/replay?topic=<topic>&limit=100'`
  with `examples/manage-dlq.sh`).
- Abandoned entries (`DLQ_RETRY_MAX_ATTEMPTS` failed replays: 3 in K8s, 5 in
  compose) are never retried: inspect them
  (`GET /dlq`), replay them by hand once the cause is fixed, or delete those
  that are obsolete (`DELETE /dlq` with their ids). Never delete entries of the
  audit topics without checking that audit-logger has them.

## DlqAuditEventLost

A `DELETE /dlq` or a replay was done, but message-manager did not accept its
audit event (`dlq.entries.deleted` or `dlq.replay.completed`), so the audit
chain has no record of it (ADR-0059). For a manual action the API answered
**502** with `auditRecorded: false`: the deletion or replay still happened.
A refused auto-retry replay is counted too, with no operator waiting for it.

1. Find the action: the dlq-service error log `DLQ event not published: the
   audit trail misses it` holds the topic and the payload (`ids`, `deleted` or
   `batchId`, and `actor`, the name of the API key).
2. Fix message-manager first
   ([runbook-message-bus-outage](runbook-message-bus-outage.md)): until it
   accepts events, every DLQ action leaves no trace in the chain.
3. Record the missing action in the incident report (time, actor, ids),
   copied from the log: the audit chain cannot be completed afterwards
   without breaking it (ADR-0027).
4. Do not run the delete or the replay again to "re-send" the event: the
   entries are already deleted or replayed.

## Escalation

Warnings: handle within business hours. Escalate to the Engineering Manager if
the backlog still grows after 4 hours, or if `JournalEntriesTrimmed` fires
(critical, messages gone).
