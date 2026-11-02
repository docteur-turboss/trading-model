# Runbook: Service Down

**Severity:** SEV1  
**Alert:** `ServiceDown`  
**Affected:** Any trading-model service

## Detection

- Prometheus alert `ServiceDown` fires
- Grafana dashboard shows `up == 0` for a target
- Clients report connection errors to a specific service

## Initial Triage

```bash
# 1. Confirm the service is actually down
kubectl get pods -n trading-model -l app.kubernetes.io/component=<service-name>

# 2. Check pod status and events
kubectl describe pod -n trading-model -l app.kubernetes.io/component=<service-name>

# 3. Check logs
kubectl logs -n trading-model deployment/<service-name> --tail=50 --previous
kubectl logs -n trading-model deployment/<service-name> --tail=50
```

## Common Causes

### 1. OOMKilled (Out of Memory)

**Symptoms:** Pod status `OOMKilled`, `CrashLoopBackOff`  
**Check:** `kubectl describe pod -n trading-model <pod> | grep -A5 "Last State"`  
**Fix:**

```bash
# Increase memory limits
kubectl patch deployment -n trading-model <service-name> -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"<service>","resources":{"limits":{"memory":"<new-limit>"}}}]}}}}'
```

### 2. CrashLoopBackOff

**Symptoms:** Pod starts then crashes repeatedly  
**Check:** `kubectl logs -n trading-model deployment/<service-name> --tail=50 --previous`  
**Fix:**

- If config error: check ConfigMap values, fix and redeploy
- If code error: rollback deployment

```bash
kubectl rollout undo -n trading-model deployment/<service-name>
```

### 3. ImagePullBackOff

**Symptoms:** Pod stuck in `ImagePullBackOff`  
**Check:** `kubectl describe pod -n trading-model <pod> | grep "Failed to pull image"`  
**Fix:**

```bash
# Verify image exists in GHCR
# Check imagePullSecrets
kubectl get secret -n trading-model ghcr-secret
# If missing, recreate:
kubectl create secret docker-registry -n trading-model ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=<user> \
  --docker-password=<token>
```

### 4. Pending (unschedulable)

**Symptoms:** Pod stuck in `Pending`  
**Check:** `kubectl describe pod -n trading-model <pod> | grep -A5 Events`  
**Fix:**

- Insufficient resources: add nodes or reduce requests
- PVC pending: check storage class availability
- Node selector mismatch: fix labels/selectors

### 5. TLS Certificate Expired

**Symptoms:** Service starts but health check fails, mTLS handshake errors  
**Check:** Service logs show TLS errors  
**Fix:**

```bash
# Check SVID expiry (SPIRE-issued, 1h TTL by default)
kubectl exec -n trading-model deployment/<service> -- \
  openssl x509 -in /run/spire/svid/svid.pem -noout -dates

# Re-issue: restart the spiffe-helper sidecar (it re-fetches the SVID from SPIRE)
kubectl rollout restart deployment/<service> -n trading-model
```

## Recovery Verification

After applying the fix, verify:

```bash
# 1. Pod is running
kubectl get pods -n trading-model -l app.kubernetes.io/component=<service-name>

# 2. Health endpoint responds
kubectl exec -n trading-model deployment/<service-name> -- curl -sk https://localhost:3000/ping

# 3. Dependent services are healthy
# 4. Alertmanager alert resolves
# 5. E2E smoke tests pass
```

## Escalation

If the service does not recover within 15 minutes:

1. Escalate to Engineering Manager
2. Consider full incident response process
3. In severe cases, route traffic away from affected service
