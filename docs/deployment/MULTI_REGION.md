# Multi-Region Deployment

**Not supported.** The platform runs in one region: one discovery Service in
front of every discovery-server replica, one Redis (sentinels in K8s,
ADR-0023), one MySQL and one MongoDB per store (ADR-0020).

An earlier version of this page described a cross-region setup driven by
`ADDRESS_MANAGER_URLS` (a list of discovery URLs tried in turn) and
`REDIS_KEY_PREFIX` (a registry prefix per region). No deployment ever set
either: `REDIS_KEY_PREFIX` was read by no code, and the multi-URL failover in
address-manager was removed with the other configuration that nothing turned on
(ADR-0029, `bun run config:check`).

## Disaster recovery without a second region

A lost region is recovered by redeploying the overlays in another one and
restoring the encrypted off-site backups. The runbook below lists what changes
from one region to the other. The data-store procedures it points to are in
[BACKUP_DR.md](BACKUP_DR.md#recovery-steps-for-total-outage).

> **Status: not exercised.** No regional failover has ever been run. The
> pieces are exercised separately (restore drills `tests/k8s/run-kind.sh` and
> `tests/backup/compose-restore-drill.sh`, SealedSecrets key drill
> `tests/k8s/sealed-secrets-key-drill.sh`), but not this sequence on a real
> second region (DNS, new cluster, bucket access from another region). Record
> the first exercise in the [DR Exercise Log](../compliance/dr-exercise-log.md)
> (policy: [Business Continuity Policy](../compliance/business-continuity-policy.md)
> § 7), and correct this runbook with what it teaches.

### What lives where

| Item | Survives the loss of the region? | Source in the new region |
| ---- | -------------------------------- | ------------------------ |
| Manifests, scripts, images | Yes | git; images by digest from the registry (`IMAGE_REGISTRY`, default `ghcr.io/<owner>`) |
| Databases, SPIRE CA keys, checkpoints | Only the off-site copy | `BACKUP_S3_*` bucket, encrypted with age |
| SealedSecrets controller keys | Only the off-site copy | `sealed-secrets-key/` in the same bucket |
| Audit anchors | Yes, if the anchor bucket is outside the lost region | `AUDIT_ANCHOR_*` bucket (ADR-0027) |
| age private key | Operator key and escrow key, held by people | [Key custody](ENCRYPTION_AT_REST.md#key-custody) |
| GitHub environment variables and secrets | Yes (GitHub) | to edit, step 4 |
| Cluster, `KUBECONFIG_*`, ingress controller, DNS | No | to recreate, steps 1, 4 and 8 |

### Runbook

**Prerequisites.** Have: the age private key (operator, or escrow from the
safe); admin access to the GitHub repository and its environments; admin
credentials of the cloud account (not the ones stored in the cluster);
`kubectl`, `kubeseal`, `rclone`, `age`, `gh` and `bash` on the workstation.

1. **Create the cluster.** Provision Kubernetes in the new region with the
   `nginx` ingress class, cert-manager and its `letsencrypt-prod` issuer
   (used by `deploy/k8s/ingress/gateway-ingress.yaml`) and a default storage
   class. Check `kubectl get nodes` and `kubectl get storageclass`.

2. **SealedSecrets controller and keys.** Do this **before** any manifest is
   applied, or no SealedSecret of `deploy/k8s/secrets/` decrypts:

   ```bash
   export BACKUP_S3_BUCKET=s3://bucket/prefix AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=...
   bash scripts/restore-sealed-secrets-key.sh --identity ~/backup-key.txt
   bash scripts/install-sealed-secrets.sh
   ```

   Details and failure modes:
   [sealed-secrets.md](sealed-secrets.md#restore-the-controller-keys-in-a-new-cluster).
   If no key backup can be fetched, the new controller generates its own key
   pair: reseal every secret against it with `bash scripts/init-sealed-secrets.sh`
   and commit `deploy/k8s/secrets`
   ([sealed-secrets.md](sealed-secrets.md#2-encrypt-your-production-secrets)).

3. **Access to the buckets from the new region.** The off-site backup bucket
   and the audit anchor bucket are S3 or S3-compatible. Their data is only
   reachable if the provider still serves them; the repository configures no
   replica. If reachable:
   - keep the **same buckets**: Object Lock (compliance mode; 30-31 days
     default for backups, `AUDIT_RETENTION_DAYS` for anchors) and the
     credentials without delete right stay as they are
     ([BACKUP_DR.md](BACKUP_DR.md#off-site-tiers), ADR-0033). Do not create a
     fresh anchor bucket: the verifier would find no anchor for the restored
     chain;
   - set `BACKUP_S3_REGION` and `AUDIT_ANCHOR_REGION` to the bucket's real
     region (not the cluster's), and `BACKUP_S3_ENDPOINT` /
     `AUDIT_ANCHOR_ENDPOINT` for a non-AWS store;
   - check that the new region's egress, and any IP or VPC condition of the
     bucket policy, allow the access.

4. **GitHub environment.** In the environment (`production` or `staging`)
   update:

   | Kind | Name | Change |
   | ---- | ---- | ------ |
   | secret | `KUBECONFIG_PRODUCTION` / `KUBECONFIG_STAGING` | base64 kubeconfig of the new cluster |
   | variables | `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ENDPOINT` | only if the bucket changed |
   | secrets | `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | only if the credentials changed |
   | variable | `BACKUP_AGE_RECIPIENTS` | unchanged (two distinct recipients in production, `BACKUP_MIN_RECIPIENTS=2`) |
   | variables | `AUDIT_ANCHOR_BUCKET`, `AUDIT_ANCHOR_REGION`, `AUDIT_ANCHOR_ENDPOINT` | only if the bucket changed |
   | secrets | `AUDIT_ANCHOR_ACCESS_KEY_ID`, `AUDIT_ANCHOR_SECRET_ACCESS_KEY` | only if the credentials changed |
   | secrets | `ALERTMANAGER_SLACK_WEBHOOK_URL`, `ALERTMANAGER_DEADMAN_URL`, `ALERTMANAGER_PAGERDUTY_ROUTING_KEY` | unchanged |

   `deploy.yml` stops before any change when the production anchor bucket or
   the backup recipients are missing. The environment
   `sealed-secrets-key-backup` is handled in step 9.

5. **Deploy the platform.** Actions → **Deploy** → environment and
   `image_tag` (the last released tag, resolved to digests); see
   [DEPLOY.md](DEPLOY.md). The databases come up empty. Before restoring,
   stop the writers (namespace `trading-model`, or `trading-model-staging`; audit-logger, dlq-service, financial-scraper,
   financial-scraper-collector) with `kubectl -n <namespace> scale
   deployment/<name> --replicas=0`, and scale them back after step 7.

6. **Fetch and restore the data.** Follow
   [Recovery Steps for Total Outage](BACKUP_DR.md#recovery-steps-for-total-outage),
   steps 2 to 5:

   ```bash
   bash scripts/fetch-offsite.sh --dest ./restore --pitr
   bash scripts/verify-backup-key.sh --identity ~/backup-key.txt --dir ./restore
   BACKUP_DIR=./restore BACKUP_AGE_IDENTITY=~/backup-key.txt bash scripts/restore-k8s.sh --until <instant>
   ```

   Without `--pitr`, restore with `--timestamp` of the fetched run instead of
   `--until`. MySQL (SPIRE datastore) is restored before the SPIRE CA keys.
   The restored audit chain stops at the backup or at `--until`: anchors
   written after it no longer match. Record the loss with `chain-cli.js
   acknowledge-loss` (runbook-audit-chain-broken in [ALERTING.md](../operations/ALERTING.md), ADR-0027); never edit
   `audit_events` by hand.

7. **Verify the restore.** `K8S_NAMESPACE=trading-model bash
   scripts/verify-restore-k8s.sh`
   ([Recovery Verification](BACKUP_DR.md#recovery-verification)); check that
   every service registers in discovery-server and that all Prometheus
   targets are `up` (mTLS through SPIRE works).

8. **Switch the entry point.** The hosts are in `deploy/k8s/ingress/`
   (`gateway-ingress.yaml`, `grafana-ingress.yaml`). Read the address of the
   new ingress controller Service (`kubectl get svc -A | grep ingress`),
   point the DNS records of the API and Grafana hosts to it (lower the TTL
   beforehand if you can), and wait for cert-manager to issue the
   certificates (`kubectl get certificate`). Then call `/v1` on the public
   host with a gateway key. Tell clients that pin the old address or keep IP
   allow-lists.

9. **Re-arm the backups.** Back up the new cluster's SealedSecrets keys
   (`bash scripts/backup-sealed-secrets-key.sh`) and create the identity of
   the daily workflow again (`bash scripts/sealed-secrets-backup-identity.sh
   | gh secret set SEALED_SECRETS_BACKUP_KUBECONFIG --env sealed-secrets-key-backup`).
   Check that the next `db-backup` and `db-backup-incremental` runs succeed
   and copy off-site. Set the bucket lifecycle rules only if the bucket is
   new ([DEPLOY.md](DEPLOY.md#prerequisites-off-site-backup-bucket)).

10. **Post-recovery checks.** Audit chain verified and anchored again
    (`audit_chain_broken` 0, `audit_chain_anchored_sequence` rising),
    `market_candles` fresh, dead letters as expected, `Watchdog` reaching the
    dead man's switch. Add the entry to the
    [DR Exercise Log](../compliance/dr-exercise-log.md): date, scenario,
    time per step, gap to the RTO / RPO.

The data loss is bounded by the RPO of ADR-0031 (1 hour with `--pitr`) when
the off-site bucket is intact. Cluster creation and DNS propagation add to the
4 hour data-store RTO of BACKUP_DR.md; no drill measures them yet.

## What a second region would need

A new ADR, and at least:

- a discovery URL per region in address-manager, with a failover policy that a
  deployment profile actually sets (`config:check` fails otherwise);
- a registry that knows instance regions (today discovery keys are global,
  `trading-model:discovery:*`);
- a decision on MySQL, MongoDB and Redis replication across regions, and on
  where the audit chain (ADR-0027) is anchored.
