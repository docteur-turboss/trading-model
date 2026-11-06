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

## Database Rollback

The automatic rollback never touches the schema. Roll it back only if the
N+1 migrations broke N (images already back on N).

Prerequisites:

1. A recent backup exists (`db-backup` CronJob, daily; hourly archives for PITR).
2. Images first: services on N must run before the schema goes back, or N+1
   code hits a schema it does not know.
3. `MIGRATE_IMAGE` pinned to the digest of the release that **applied** the
   migrations (an older image lacks the `.down.sql` of newer ones).

```bash
# Applied migrations before
kubectl exec -n trading-model mysql-0 -c mysql -- sh -c   'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -e "SELECT id FROM financial_scraper._migrations ORDER BY id"'

# Roll back the last N migrations (default 1), or all
MIGRATE_IMAGE=<registry>/db-migrate@sha256:<digest-of-release-N+1>   ./deploy/k8s/scripts/deploy-k8s.sh migrate-down [N|all]
```

`<registry>` is `${IMAGE_REGISTRY:-ghcr.io/<owner>}` (not the logical name
`ghcr.io/trading-model/`). Verify: rerun the `SELECT` (rolled-back ids are
gone), then `kubectl logs -n trading-model job/db-migrate-down` and the health
checks above.

Limits:

- Destructive migrations do not return data: `004_fix_market_data_primary_keys`
  down re-adds `id` to the primary keys, not what the up step discarded.
  Restore instead: `restore-k8s.sh --until <instant>` (PITR, RPO 1 h,
  [ADR-0031](../../adr/0031-point-in-time-recovery-hourly-archives.md)).
- Expand/contract (ADR-0040): N+1 only adds, so N normally runs on the N+1
  schema and a schema rollback is rarely needed.
- A failed run resumes at the failed statement: check `_migration_steps` before rerunning.

## Canary Deployment Rollback (via deploy scripts)

```bash
# Manual rollback for K8s
./deploy/k8s/scripts/deploy-k8s.sh rollback <service>
```

## Root Cause Investigation

### 1. Check what changed

```bash
# Compare current vs previous deployment
# <env> = staging | production. Kustomize first: raw manifests are not what deploy.yml applies.
kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/k8s/overlays/<env> \
  | kubectl diff -n trading-model -f -

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
- [ ] Deployment: use canary for major changes (`deploy.yml` uses 10%: `canary_replicas = total * 10 / 100`, minimum 1; 2 replicas give 1 canary pod, about 33% of traffic)
- [ ] Post-deployment: nothing to watch by hand, the `Verify release` step of `deploy.yml` (`deploy-k8s.sh verify-release`) repeats an API call through edge-proxy, a market-data freshness check and a no-critical-alert check over `VERIFY_WINDOW_SECONDS` (default 600 s) and rolls back on failure (docs/deployment/DEPLOY.md, "Release verification")
