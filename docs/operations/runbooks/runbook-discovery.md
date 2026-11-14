# Runbook: Service Discovery (instances and heartbeats)

**Alerts:** `InstanceCountLow` (critical), `HeartbeatStopped` (critical).

## How registration works

Every service with an address-manager (message-manager, financial-scraper,
trader-trainer, audit-logger, dlq-service) registers each of its instances
with discovery-server (`POST /register`, mTLS), then renews its lease with a
heartbeat (`POST /heartbeat`, every `TTL_REFRESH_INTERVAL_MS`, default 15 s,
authenticated by its instance token). Leases and tokens live in Redis
(ADR-0023), so every discovery-server replica (3 in K8s) validates every
heartbeat. After 3 failed heartbeats, or a `401` (token unknown), the instance
registers again. An expired lease is removed by the cleanup cycle
(`CLEANUP_SERVICE_INTERVAL_MS`): **15 s in K8s**
(`deploy/k8s/config/discovery-server.properties`), 10 min by default (compose).

Metrics, exported by every discovery-server replica:

- `discovery_registered_instances_per_service{service}`: instances in the
  Redis registry, re-read from Redis at each register, unregister and cleanup
  cycle (so a lease that expired is still counted until the next cleanup:
  at most 15 s in K8s, 10 min in compose).
- `discovery_heartbeats_total{service}`: heartbeats **accepted** (200) by that
  replica. A heartbeat refused (401 token, 404 unknown instance, 429 rate
  limit) is not counted.

## InstanceCountLow

`max by (service) (discovery_registered_instances_per_service) < 2` while the
same service had 2 or more instances for 15 minutes at some point in the last day, for
2 minutes. Single-replica environments (compose, staging) never fire, nor does
the surge pod of a rolling update (2 instances for a few minutes).

### Symptom

A service lost its redundancy: one instance (or none) left. Another failure
takes it down; HPA-scaled services may be throttled.

### Diagnosis

```bash
NS=trading-model
SVC=<service label of the alert>
# 1. Pods actually running vs desired
kubectl -n $NS get deploy $SVC
kubectl -n $NS get pods -l app.kubernetes.io/component=$SVC -o wide
kubectl -n $NS describe deploy $SVC | tail -20

# 2. What discovery has registered (through edge-proxy and the gateway)
kubectl port-forward -n $NS svc/edge-proxy 8449:8080 &
curl -s http://localhost:8449/v1/discovery-server/services/$SVC -H "x-api-key: <GATEWAY_AUTH_TOKENS value>"

# 3. Registration errors on the side of the instances
kubectl -n $NS logs deploy/$SVC --tail=200 | grep -iE "regist|heartbeat"
```

Two cases:

1. **Pods are missing** (step 1 shows fewer ready pods than desired):
   `CrashLoopBackOff`, `Pending` (no node fits: `topologySpreadConstraints`
   `DoNotSchedule`, ADR-0024), `OOMKilled`, or an HPA that scaled down. Follow
   [runbook-service-down](runbook-service-down.md).
2. **Pods run but are not registered** (step 1 fine, step 2 short): the
   instances cannot register. Logs show the cause: discovery-server or Redis
   unreachable, `403` (caller SPIFFE ID or source IP refused), SVID problem
   ([runbook-certificate-expiry](runbook-certificate-expiry.md)). Check
   discovery-server itself:

   ```bash
   kubectl exec -n $NS deployment/discovery-server -c discovery-server -- \
     curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
     https://localhost:3000/ping
   kubectl -n $NS logs deploy/discovery-server --tail=200 | grep -iE "error|redis"
   ```

   Redis down: [runbook-database-failover](runbook-database-failover.md#redis-failover).

### Remediation

- Missing pods: fix the pod cause, or scale back
  (`kubectl -n $NS scale deploy/$SVC --replicas=<n>`).
- Instances not registered: restore discovery-server / Redis / mTLS; the
  address-manager retries registration by itself. A pod stuck in a failed
  registration loop: `kubectl -n $NS rollout restart deploy/$SVC`.
- A service scaled down **on purpose** to one replica: the alert keeps firing
  for up to a day (`max_over_time(...[1d])`); silence it with an explanation ([procedure](../on-call.md#silence-an-alert-maintenance)).

## HeartbeatStopped

`sum by (service) (rate(discovery_heartbeats_total[5m])) == 0` for 1 minute:
discovery-server accepted no heartbeat of a service for 5 minutes, although it
accepted some before (the series exists only once a first heartbeat was
counted; it disappears when the discovery-server replicas restart).

### Symptom

Every instance of the service stopped renewing its lease: within the lease
TTL, discovery drops them and callers can no longer resolve the service.

### Diagnosis

```bash
# 1. Are the instances alive?
kubectl -n $NS get pods -l app.kubernetes.io/component=$SVC
kubectl exec -n $NS deployment/$SVC -c $SVC -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/health/ready

# 2. What the instances say about their heartbeats
kubectl -n $NS logs deploy/$SVC --tail=200 | grep -iE "heartbeat|re-regist"

# 3. What discovery answers (401, 404, 429 in its logs)
kubectl -n $NS logs deploy/discovery-server --tail=300 | grep -iE "heartbeat|token|429"
```

Common causes:

1. **The service is down**: `ServiceDown` fires too
   ([runbook-service-down](runbook-service-down.md)).
2. **Heartbeats refused**: log `Heartbeat failed` on the instance side.
   `401` means discovery no longer knows the token (Redis flushed or failed
   over without its data, `SIGNING_SECRET` changed between replicas): the
   instance re-registers by itself, check that it succeeds. `404`: the lease
   expired and was cleaned; the instance re-registers after 3 failures. `429`:
   more than 60 heartbeats a minute from one client.
3. **discovery-server unreachable from the service**: NetworkPolicy, DNS, or
   discovery-server down (that one raises `ServiceDown` on `discovery-server`).

### Remediation

- Restore the service, discovery-server or Redis with the matching runbook.
- Instances that do not recover their registration on their own:
  `kubectl -n $NS rollout restart deploy/$SVC` (they register at start).
- `SIGNING_SECRET` different between discovery replicas: they must all read
  the same value from the `trading-model-secrets` Secret; fix it, then
  `kubectl -n $NS rollout restart deploy/discovery-server`.

The alert resolves as soon as heartbeats are accepted again.

## Escalation

Both alerts are critical: page the on-call engineer. Not resolved in
15 minutes, or several services affected at once (discovery or Redis
outage): open an incident ([incident-response.md](../incident-response.md)),
escalate to the Engineering Manager.
