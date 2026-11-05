# Runbook: High Latency or Error Rate

**Alerts:** `HighLatency` (warning), `SLOLatencyFastBurn` (critical),
`SLOLatencySlowBurn` (warning), `HighErrorRate` (warning),
`SLOAvailabilityFastBurn` / `SLOErrorRateFastBurn` (critical),
`SLOAvailabilitySlowBurn` / `SLOErrorRateSlowBurn` (warning).

All of them read the shared HTTP middleware metrics of every service
(`packages/server-utils`, `http_request_duration_seconds` and
`http_requests_total`, labels `method`, `path`, `status`), grouped by scrape
`job`. Targets and error budgets: [slo.md](../slo.md).

## Which alert tells what

| Alert | Fires when |
| --- | --- |
| `HighLatency`, `SLOLatencyFastBurn` | P95 of a job above 5 s over 5 min, for 2 min |
| `SLOLatencySlowBurn` | P95 above 3 s over 1 h, for 10 min |
| `HighErrorRate`, `SLOErrorRateFastBurn` | more than 5% of 5xx over 5 min, for 2 min |
| `SLOAvailabilityFastBurn` | more than 2% of 5xx over 5 min, for 2 min |
| `SLOAvailabilitySlowBurn` / `SLOErrorRateSlowBurn` | more than 0.5% / 2% of 5xx over 1 h, for 10 min |

The histogram stops at 30 s (largest finite bucket): a P95 of 30 s means
"30 s or more", usually timeouts.

## HighLatency

### Symptom

A service answers, but slowly: callers time out, their circuit breakers or
retries kick in, and 5xx often follow (`HighErrorRate`).

### Diagnosis

```bash
NS=trading-model
JOB=<job label of the alert>
# 1. Which routes are slow (P95 per path over 5 min)
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,sum by (path,le) (rate(http_request_duration_seconds_bucket{job=\"$JOB\"}[5m])))"

# 2. Saturation: CPU throttling, memory, restarts
kubectl -n $NS top pods -l app.kubernetes.io/component=$JOB
kubectl -n $NS get pods -l app.kubernetes.io/component=$JOB

# 3. Dependencies: errors and timeouts in the logs
kubectl -n $NS logs deploy/$JOB --tail=200 | grep -iE "timeout|ECONN|slow|circuit"

# 4. The service itself (mTLS only: use its SVID)
kubectl exec -n $NS deployment/$JOB -c $JOB -- \
  curl -skf -w '%{time_total}s\n' --cert /run/spire/svid/svid.pem \
  --key /run/spire/svid/svid_key.pem https://localhost:3000/health/ready
```

Compose: `docker exec <container> curl -skf -w '%{time_total}s\n' --cert
/run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem
https://localhost:3000/<route>` (containers and routes:
[on-call.md](../on-call.md#health-check-endpoints)).

Common causes:

1. **A slow dependency**: MongoDB, MySQL or Redis (see
   [runbook-database-failover](runbook-database-failover.md)), Binance for the
   scraper, message-manager for publishers (see
   [runbook-message-bus-outage](runbook-message-bus-outage.md)). The slow path
   of step 1 names it.
2. **CPU throttling or GC pressure**: `kubectl top` near the limit, or
   `HighMemoryUsage` firing on the same job.
3. **A heavy request**: one `path` alone is slow (large `GET /dlq` page, a
   market data range without limit).
4. **A recent deploy**: compare with `kubectl -n $NS rollout history deploy/$JOB`.

### Remediation

- Dependency: fix it with its runbook; latency drops by itself.
- Saturation: scale out (`kubectl -n $NS scale deploy/$JOB --replicas=<n>`, or
  raise the HPA maximum) or raise the CPU / memory limits.
- Recent deploy: roll back
  ([runbook-deployment-failure](runbook-deployment-failure.md)).

The alert resolves once the 5 min P95 stays under 5 s.

## HighErrorRate

### Symptom

More than the target share of the requests of a job end in 5xx.

### Diagnosis

```bash
# Which routes and status codes fail
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  "http://localhost:9090/api/v1/query?query=sum by (path,status) (rate(http_requests_total{job=\"$JOB\",status=~\"5..\"}[5m]))"
kubectl -n $NS logs deploy/$JOB --tail=200 | grep -iE "\"level\":\"error\"|error"
```

- `503` on `/health/ready` or every route: a dependency is down (readiness
  check names it in the response body).
- `502` / `504` from api-gateway: the target service is down or slow
  (`ServiceDown`, `HighLatency` on that job).
- `500` on one route: a bug; the log line carries the stack.

### Remediation

Fix the dependency, roll back a bad deploy
([runbook-deployment-failure](runbook-deployment-failure.md)) or restart a
stuck pod (`kubectl -n $NS rollout restart deploy/$JOB`). A burn-rate alert
consumes error budget: apply the [error budget policy](../slo.md#error-budget-policy).

## Escalation

- Critical burn-rate alert not resolved in 15 minutes: open an incident
  ([incident-response.md](../incident-response.md)), escalate to the
  Engineering Manager.
- Slow-burn warnings only: handle during business hours, report the budget
  consumed in the next SLO review.
