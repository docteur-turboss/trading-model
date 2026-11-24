# Runbook: Circuit Breaker Open

**Alert:** `HttpCircuitBreakerRejecting` (warning):
`sum by (job, target, kind) (rate(http_circuit_breaker_rejections_total[5m])) > 0` for 10 minutes.

The address-manager breaker per target instance (alert `CircuitBreakerOpen`)
is gone: services reach each other by DNS name since ADR-0072, so there is no
instance to pick or skip.

## Symptom

The shared HTTP client has its own breaker (per hostname and per service). Each
call it refuses increments `http_circuit_breaker_rejections_total{target,kind}`;
a sustained rate fires `HttpCircuitBreakerRejecting` (warning). The caller
(`job`) fails its calls to `target` fast instead of waiting on a failing
dependency.

## Diagnosis

```bash
NS=trading-model
# 1. Which caller, which target
kubectl -n $NS exec prometheus-0 -c prometheus -- wget -qO- \
  'http://localhost:9090/api/v1/query?query=sum by (job, target, kind) (rate(http_circuit_breaker_rejections_total[5m])) > 0'

# 2. Is the target healthy? (mTLS only: probe it from its own pod, with its SVID)
kubectl exec -n $NS deployment/<target service> -c <target service> -- \
  node -e "$SVID_GET" https://localhost:3000/health/ready

# 3. Why the caller's calls fail: timeouts, TLS refusals, 5xx
kubectl -n $NS logs deploy/<caller job> --tail=200 | grep -iE "circuit|timeout|ECONN|certificate|50[234]"
```

Common causes:

1. **The target is down or restarting**: `ServiceDown` or a
   `CrashLoopBackOff` pod ([runbook-service-down](runbook-service-down.md)).
2. **The target is slow**: its P95 is high (`SLOLatencyFastBurn`).
3. **mTLS refusal**: the caller's SPIFFE ID is not allowed by the target, or an
   SVID expired (`CertificateExpiry`,
   [runbook-certificate-expiry](runbook-certificate-expiry.md)). Logs show TLS
   or 403 errors.

## Remediation

Fix the target with the runbook of the cause above. The breaker lets a probe
call through after its timeout and closes by itself after a successful call:
no restart of the caller is needed.

## Escalation

Not resolved in 30 minutes, or every caller of a service refused: open an
incident ([incident-response.md](../incident-response.md)).
