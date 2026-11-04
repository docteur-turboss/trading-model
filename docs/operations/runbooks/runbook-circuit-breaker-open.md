# Runbook: Circuit Breaker Open

**Alert:** `CircuitBreakerOpen` (critical):
`address_manager_circuit_breaker_state == 1` for 1 minute.

## What the breaker is

Every service that calls another one resolves it through its address-manager
(`packages/address-manager`). The address-manager keeps one circuit breaker
per **target instance** (`instanceId`): after 3 failed calls in a row
(`circuitBreakerFailureThreshold`) or a P99 latency over its threshold, it
opens and stops handing that instance out; after 10 s
(`circuitBreakerHalfOpenTimeoutMs`) it lets one probe call through
(half-open), and closes again on success. The state is shared between the
replicas of the caller through Redis (`circuit:<instanceId>` keys, next to the
cached instances), so an instance tripped by one replica is skipped by all.

The gauge is exported by the **caller** (scrape `job`), labelled with the
target `instanceId`; values `0=closed, 1=open, 2=half-open`.

> **Known limit (2026-11-04):** nothing sets `address_manager_circuit_breaker_state`
> today, and no caller reports call outcomes to the breaker
> (`DiscoveryOrchestrator.recordCallFailure` has no caller), so this alert
> cannot fire yet. The procedure below applies once the breaker is wired; until
> then a failing dependency shows up as `HighErrorRate`, `HighLatency` or
> `ServiceDown` ([runbook-latency-and-errors](runbook-latency-and-errors.md),
> [runbook-service-down](runbook-service-down.md)).

## Symptom

A caller stopped sending requests to one instance of a dependency. With a
single instance (or all of them open), the calls fail fast: discovery falls back
to a stale cached instance (log `Circuit breaker exhausted — returning stale
cached instance as fallback`) or the call fails.

## Diagnosis

```bash
NS=trading-model
# 1. Which caller, which target instance
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=address_manager_circuit_breaker_state==1'

# 2. Which service that instance belongs to, and whether it is still registered
kubectl port-forward -n $NS svc/edge-proxy 8449:8080 &
curl -s http://localhost:8449/v1/discovery-server/services -H "x-api-key: <GATEWAY_AUTH_TOKENS value>"

# 3. Is the target healthy? (mTLS only: probe it from its own pod, with its SVID)
kubectl exec -n $NS deployment/<target service> -c <target service> -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/health/ready

# 4. Why the caller's calls fail: timeouts, TLS refusals, 5xx
kubectl -n $NS logs deploy/<caller job> --tail=200 | grep -iE "circuit|timeout|ECONN|certificate|50[234]"
```

Common causes:

1. **The target instance is down or restarting**: `ServiceDown` or a
   `CrashLoopBackOff` pod ([runbook-service-down](runbook-service-down.md)).
2. **The target is slow**: its P95 is high (`HighLatency`); the latency
   threshold opened the breaker.
3. **mTLS refusal**: the caller's SPIFFE ID is not allowed by the target, or an
   SVID expired (`CertificateExpiry`,
   [runbook-certificate-expiry](runbook-certificate-expiry.md)). Logs show TLS
   or 403 errors.
4. **Stale registration**: the instance left (pod deleted) but its address is
   still cached; it disappears with its lease (`InstanceCountLow`,
   [runbook-discovery](runbook-discovery.md)).

## Remediation

- Fix the target with the runbook of the cause above. The breaker probes every
  10 s and closes by itself after a successful call: no restart of the caller
  is needed.
- A target instance gone for good: delete its pod if it still runs
  (`kubectl -n $NS delete pod <pod>`); discovery drops the lease, the caller
  stops picking it.
- Do not delete the `circuit:*` Redis keys to force the breaker closed: calls
  would go back to a failing instance.

The alert resolves once the gauge is back to `0` (closed) or `2` (half-open)
for the instance.

## Escalation

Critical: page the on-call engineer. Not resolved in 15 minutes, or open on
every instance of a service: open an incident
([incident-response.md](../incident-response.md)) and escalate to the
Engineering Manager.
