# Runbook: Deployment Failure

**Severity:** SEV1-SEV2  
**Alert:** `HighErrorRate`, `ServiceDown` post-deployment

## Detection

- Prometheus alerts fire immediately after deployment
- Synthetic monitoring shows error rate increase
- Rollout status shows `CrashLoopBackOff` or unavailable replicas
- E2E smoke tests fail

## Immediate Response

### Automatic Rollback (Kubernetes)

```bash
# Undo the last deployment
kubectl rollout undo -n trading-model deployment/<service-name>

# Wait for rollback to complete
kubectl rollout status -n trading-model deployment/<service-name>

# Verify service is healthy
kubectl exec -n trading-model deployment/<service-name> -- \
  curl -sk https://localhost:3000/ping
```

### Rollback to Specific Version

```bash
# View rollout history
kubectl rollout history -n trading-model deployment/<service-name>

# Roll back to specific revision
kubectl rollout undo -n trading-model deployment/<service-name> --to-revision=<N>

# Verify
kubectl rollout status -n trading-model deployment/<service-name>
```

### Full Cluster Rollback (multi-service deployment)

If multiple services were deployed together:

```bash
# Revert to previous known-good image tags
for service in discovery-server message-manager financial-scraper trader-trainer \
               api-gateway audit-logger dlq-service admin-interface; do
  kubectl set image -n trading-model deployment/$service $service=ghcr.io/trading-model/$service:<previous-stable-tag>
done

# Monitor rollout
kubectl rollout status -n trading-model deployment/discovery-server
kubectl rollout status -n trading-model deployment/message-manager
# ... for all services
```

## Canary Deployment Rollback (via deploy scripts)

```bash
# Manual rollback for K8s
./deploy/k8s/scripts/deploy-k8s.sh rollback <service>
```

## Root Cause Investigation

### 1. Check what changed

```bash
# Compare current vs previous deployment
kubectl diff -n trading-model -f deploy/k8s/

# Check container image tag
kubectl get deployment -n trading-model <service-name> -o jsonpath='{.spec.template.spec.containers[0].image}'
```

### 2. Check logs

```bash
# Previous pod logs (before crash)
kubectl logs -n trading-model deployment/<service-name> --previous --tail=100

# Current pod logs
kubectl logs -n trading-model deployment/<service-name> --tail=100
```

### 3. Check resource issues

```bash
kubectl describe pod -n trading-model -l app.kubernetes.io/component=<service-name>
```

## Post-Recovery

### After successful rollback

- [ ] Verify all health endpoints return 200
- [ ] Run E2E smoke tests (`bun run test:e2e:docker`)
- [ ] Confirm Prometheus alerts resolve
- [ ] Document deployment failure in post-mortem

### Before re-deploying

- [ ] Identify root cause (config error, code bug, resource limit, etc.)
- [ ] Fix in development branch
- [ ] Run full CI pipeline on fix branch
- [ ] Deploy to staging first
- [ ] Monitor staging for 30 minutes before production
- [ ] If staging passes, deploy to production with canary

## Prevention Checklist

- [ ] Pre-deployment: verify ConfigMap changes match acceptance criteria
- [ ] Pre-deployment: run E2E smoke tests
- [ ] Pre-deployment: verify resource requests/limits
- [ ] Deployment: use rolling update with `maxUnavailable: 1`
- [ ] Deployment: use canary (2% traffic) for major changes
- [ ] Post-deployment: monitor for 15 minutes before leaving
