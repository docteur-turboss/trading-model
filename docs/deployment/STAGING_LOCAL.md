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
| Local secrets | `~/.trading-staging/env` (MinIO root, S3 users, runner token) and `~/.trading-staging/backup-age-identity.txt` (private age key of the staging backups): never committed |

The Ingress answers on `https://localhost:9443` (self-signed certificate).
The compose stack keeps `https://localhost:8449`.

## Selection in deploy.yml

- Repository variable `STAGING_RUNNER` (`trading-staging`): `runs-on` label of the
  staging job. Unset: `ubuntu-latest`.
- Variable `K8S_OVERLAY` of the environment `staging` (`staging-local`): the
  overlay directory. Unset: the environment name.

`deploy.yml` checks out the release tag: a tag older than the `staging-local`
overlay cannot be deployed this way.

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

Ephemeral (one job, then it registers again), in a container, without the
Docker socket. It reads a fine-grained personal access token restricted to this
repository with **Administration: read and write** (registration tokens), as
`RUNNER_ACCESS_TOKEN` in `~/.trading-staging/env`, then:

```bash
docker compose -p trading-staging -f deploy/staging-local/docker-compose.yml --env-file ~/.trading-staging/env up -d runner
```

The repository is public: keep **Settings → Actions → General → "Require approval
for all external contributors"**, so that a fork pull request cannot run a
workflow that targets the `trading-staging` label without a maintainer's approval.

## Renewal and teardown

- The deploy tokens last 168 h: run `bootstrap.sh identities` again before a
  deploy once they have expired ("Configure kubeconfigs" fails otherwise).
- A new kind cluster has a new Sealed Secrets key: seal again
  (`init-sealed-secrets.sh`) and commit.
- Teardown (Docker Desktop's disk image lives on C: and never shrinks):
  `kind delete cluster --name trading-staging` and
  `docker compose -p trading-staging -f deploy/staging-local/docker-compose.yml down`
  (add `-v` to drop MinIO's data).
