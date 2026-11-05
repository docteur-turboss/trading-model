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

The `Deploy` workflow rolls back by itself when the rollout, the smoke test or the release verification
fails: each Deployment returns to the revision recorded before the overlay,
image **and** service configuration (the `<service>-config` ConfigMaps carry a
content hash in their name, so the old pod template names the old ConfigMap).
It does not roll back StatefulSets, CronJobs, Jobs, HPAs, PDBs,
NetworkPolicies, the node agents, fixed-name ConfigMaps or the database schema
(details: [DEPLOY.md, Rollback](../../deployment/DEPLOY.md#rollback)).

By hand, for one service:

```bash
# Undo the last deployment (image and its hashed ConfigMap)
kubectl rollout undo -n trading-model deployment/<service-name>

# Wait for rollback to complete
kubectl rollout status -n trading-model deployment/<service-name>

# Verify service is healthy
kubectl exec -n trading-model deployment/<service-name> -c <service-name> -- \
  curl -skf --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
  https://localhost:3000/ping
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

If multiple services were deployed together, re-run the `Deploy` workflow from
the git ref of the last known-good release, with its image tag. It re-applies
the whole overlay of that release (configuration, CronJobs, policies...) pinned
to its digests. `kubectl set image` would only change the image and keep the
new configuration.

```bash
gh workflow run deploy.yml --ref v<previous-stable> \
  -f environment=production -f image_tag=<previous-stable>
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
- [ ] Post-deployment: nothing to watch by hand, the `Verify release` step of `deploy.yml` (`deploy-k8s.sh verify-release`) repeats an API call through edge-proxy, a market-data freshness check and a no-critical-alert check over `VERIFY_WINDOW_SECONDS` (default 600 s) and rolls back on failure (docs/deployment/DEPLOY.md, "Release verification")
