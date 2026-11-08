# Local staging (kind)

The GitHub environment `staging` deploys to a kind cluster on the operator's
machine. `deploy.yml` runs there on a self-hosted runner, since GitHub-hosted
runners cannot reach `127.0.0.1`. Production is unchanged: GitHub-hosted runner,
overlay `production`.

| Piece | Where |
|-------|-------|
| Cluster `trading-staging` (kind v0.27.0, as the CI `k8s` job) | `deploy/staging-local/kind.yaml` |
| MinIO (audit anchors, off-site backups) and the runner | `deploy/staging-local/docker-compose.yml`, project `trading-staging`, both on the Docker network `kind` |
| Overlay | `deploy/k8s/overlays/staging-local`: `staging` + self-signed TLS (`selfsigned-local`), Ingress allow-list `172.18.0.0/16`, audit-logger egress to MinIO `172.18.0.200:9000`, SealedSecret sealed for the kind controller |
| Local secrets | `~/.trading-staging/env` (MinIO root, S3 users) and `~/.trading-staging/backup-age-identity.txt` (private age key of the staging backups): never committed |

The Ingress answers on `https://localhost:9443` (self-signed certificate).
The compose stack keeps `http://localhost:8449` (edge-proxy).

## Selection in deploy.yml

- Repository variable `STAGING_RUNNER` (`trading-staging`): `runs-on` label of the
  staging job. Unset: `ubuntu-latest`.
- Variable `K8S_OVERLAY` of the environment `staging` (`staging-local`): the
  overlay directory. Unset: the environment name.
- Variable `DEPLOY_TIMEOUT_FACTOR` of the environment `staging` (`4`): integer
  the MySQL, migration Job and rollout timeouts are multiplied by. The kind
  cluster shares the laptop disk with the compose stack: MySQL's first start
  and the image pulls outlast the production timeouts. Unset: 1.

`deploy.yml` checks out the release tag: a tag older than the `staging-local`
overlay cannot be deployed this way. Its scripts come from the tag too, so
`DEPLOY_TIMEOUT_FACTOR` only reaches the migration Jobs and rollouts of a tag
that has it (3.0.1 and later); the MySQL wait is in `deploy.yml` itself.

## Setup, once

```bash
kind create cluster --config deploy/staging-local/kind.yaml
docker compose -p trading-staging -f deploy/staging-local/docker-compose.yml --env-file ~/.trading-staging/env up -d minio
bash deploy/staging-local/bootstrap.sh prereqs      # ingress-nginx, cert-manager, VPA CRD, Sealed Secrets, rwx-csi
OVERLAY=staging-local bash scripts/init-sealed-secrets.sh   # then commit the overlay's sealed-secrets.yaml
bash deploy/staging-local/bootstrap.sh identities   # KUBECONFIG_STAGING_APP / _CLUSTER of the environment staging
```

MinIO: bucket `trading-staging-backup` (Object Lock compliance, 31 days, the
lifecycle rules of [BACKUP_DR.md](BACKUP_DR.md#off-site-tiers) under `staging/`),
user `staging-backup` (no delete right, ADR-0033); bucket
`trading-staging-audit-anchor` (Object Lock), user `staging-anchor` (put, get,
list, ADR-0027). Their keys and the age recipient go to the environment
`staging` (`BACKUP_S3_*`, `AUDIT_ANCHOR_*`, `BACKUP_AGE_RECIPIENTS`).

MinIO no longer publishes binaries or images: the compose file pins the
`pgsty/minio` community build by digest.

## Runner

In a container, without the Docker socket. Registered once with a
registration token (valid 1 h): GitHub has no API to create the fine-grained
token an ephemeral runner needs, and no long-lived token is stored. Its
credentials stay in the volume `runner-data`, so restarts keep the registration:

```bash
RUNNER_TOKEN=$(gh api -X POST repos/docteur-turboss/trading-model/actions/runners/registration-token -q .token) \
  docker compose -p trading-staging -f deploy/staging-local/docker-compose.yml --env-file ~/.trading-staging/env up -d runner
```

Register again (same command, after `docker volume rm trading-staging_runner-data`)
if the runner is removed in Settings → Actions → Runners.

The repository is public: keep **Settings → Actions → General → "Require approval
for all external contributors"**, so that a fork pull request cannot run a
workflow that targets the `trading-staging` label without a maintainer's approval.

## SealedSecrets key backup

Until a production cluster exists, `sealed-secrets-key-backup.yml` (ADR-0035)
backs up the controller keys of this cluster, on the same runner (repository
variable `SEALED_SECRETS_BACKUP_RUNNER=trading-staging`; kubectl, age and
rclone are installed on it, no Docker). Environment `sealed-secrets-key-backup`:
`SEALED_SECRETS_BACKUP_KUBECONFIG` from
`bash scripts/sealed-secrets-backup-identity.sh --server https://trading-staging-control-plane:6443`,
the `staging-backup` MinIO user and the `BACKUP_*` variables of `staging`,
`BACKUP_MIN_RECIPIENTS=1` (one age key here). The copy lands in the local
MinIO, on the same machine: it survives the loss of the cluster, not of the
laptop. For production, delete `SEALED_SECRETS_BACKUP_RUNNER` and
`BACKUP_MIN_RECIPIENTS`, then fill the environment with the production values.

## Renewal and teardown

- The deploy tokens last 168 h: run `bootstrap.sh identities` again before a
  deploy once they have expired ("Configure kubeconfigs" fails otherwise).
- A release that adds or changes a ClusterRole or ClusterRoleBinding (3.1.0:
  `prometheus-nodes`) needs `bootstrap.sh identities` again, from a checkout
  of that release, before its deploy, even with valid tokens: deploy-cluster
  may only read them, and the admin applies them (ADR-0041). Otherwise "Check
  overlay ClusterRoles" stops the deploy before any apply and names the objects.
- A new kind cluster has a new Sealed Secrets key: seal again
  (`init-sealed-secrets.sh`) and commit.
- A release that adds a key to `trading-model-secrets` (3.1.0:
  `MYSQL_EXPORTER_PASSWORD`, `REDIS_EXPORTER_PASSWORD`) must add it here too,
  or "Check sealed secrets" stops the deploy on the `staging` placeholder. Seal
  only the new keys into the existing file, never `init-sealed-secrets.sh`
  (it draws new values for every key, which no longer match the initialized
  databases):
  `kubectl create secret generic trading-model-secrets -n trading-model-staging --from-literal=<KEY>="$(openssl rand -hex 24)" --dry-run=client -o yaml | kubeseal --controller-namespace sealed-secrets --merge-into deploy/k8s/overlays/staging-local/sealed-secrets.yaml`.
  kubeseal 0.27 rewrites the file as JSON: keep the YAML, add only the new lines.
- Teardown (Docker Desktop's disk image lives on C: and never shrinks):
  `kind delete cluster --name trading-staging` and
  `docker compose -p trading-staging -f deploy/staging-local/docker-compose.yml down`
  (add `-v` to drop MinIO's data).
