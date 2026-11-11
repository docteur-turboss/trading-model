# Local staging (kind)

The GitHub environment `staging` deploys to a kind cluster on the operator's
machine. `deploy.yml` runs there on a self-hosted runner, since GitHub-hosted
runners cannot reach `127.0.0.1`. Production is unchanged: GitHub-hosted runner,
overlay `production`.

| Piece | Where |
|-------|-------|
| Cluster `trading-staging` (kind v0.27.0, as the CI `k8s` job) | `deploy/staging-local/kind.yaml` |
| MinIO (audit anchors, off-site backups) and the runner | `deploy/staging-local/docker-compose.yml`, project `trading-staging`, both on the Docker network `kind` |
| Overlay | `deploy/k8s/overlays/staging-local`: `staging` + self-signed TLS (`selfsigned-local`), Ingress allow-list `172.18.0.0/16`, audit-logger egress to MinIO `172.18.0.200:9000`, SealedSecret sealed for the kind controller, data StatefulSets held by a partition ([below](#database-pods-across-releases)) |
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
  and the image pulls outlast the production timeouts. Unset: 1. The migration
  Jobs' own `activeDeadlineSeconds` is multiplied too (`run-migrations.sh`,
  `deploy-k8s.sh migrate-down`): otherwise the Job dies at its base deadline
  while the deploy still waits for it (issue #760).

The cluster also shares the Docker VM's memory with the compose stack. Before a
deploy, `docker stats --no-stream` must leave room: once the VM swaps, every
probe of the cluster times out, the Mongo liveness probes restart their pods in
a loop and audit-logger answers 503 (issue #760: the compose Jaeger held
11.5 GiB of in-memory traces; it is now bounded by `MEMORY_MAX_TRACES` and
`mem_limit`).

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

### Runner isolation

The runner is persistent (not ephemeral) and the repository is public: a fork
pull request runs its own version of the workflows, so it can add a job with
`runs-on: [self-hosted, trading-staging]`. That job would reach the Docker
network `kind` (MinIO, kind API server) and could leave a backdoor in
`/runner/data` that steals `KUBECONFIG_STAGING_APP` / `_CLUSTER` at the next
staging deploy (issue #842).

- Keep **Settings → Actions → General → "Require approval for all external
  contributors"** (API field `approval_policy` =
  `all_external_contributors`). A maintainer then approves every fork run
  before it starts: read its workflow changes before approving.
- `deploy.yml` checks it: when the target is `staging` and `STAGING_RUNNER` is
  set, the `check-environment` job reads
  `GET /repos/{owner}/{repo}/actions/permissions/fork-pr-contributor-approval`
  with `ENVIRONMENT_READ_TOKEN` (`scripts/check-environment-protection.mjs
  --fork-approval`). Any other value, a missing token or an unreadable setting
  (403, 404, 5xx) fails `check-environment`, so the deploy job never starts
  and never hands `KUBECONFIG_STAGING_*` to the runner. A preflight
  (`preflight_only: true`) stops there too: it shows only this `::error::`,
  not the table of the other guards.
- `sealed-secrets-key-backup.yml` does the same: when `SEALED_SECRETS_BACKUP_RUNNER`
  is set, job `check-fork-approval` (GitHub-hosted) runs the same check, and
  the backup job `needs:` it, so the self-hosted runner never gets
  `SEALED_SECRETS_BACKUP_KUBECONFIG` or the MinIO credentials on failure
  (issue #860).
- Runner group limited to the workflows `deploy.yml` and
  `sealed-secrets-key-backup.yml` ("Selected workflows"): runner groups need an
  organization. The repository belongs to a personal account, so this layer is
  missing; the approval setting is the only barrier. Move the repository to an
  organization to add it.
- After any doubt (an unexpected job on the runner, a fork run approved by
  mistake), purge the runner: delete it in Settings → Actions → Runners, then
  `docker compose -p trading-staging -f deploy/staging-local/docker-compose.yml rm -sf runner`,
  `docker volume rm trading-staging_runner-data`, register it again (command
  above), then revoke the staging deploy tokens (a stolen one stays valid up
  to 168 h): `scripts/deploy-identity.sh app --revoke` and `cluster --revoke`
  with the arguments of `bootstrap.sh identities` (ADR-0041), then
  `bash deploy/staging-local/bootstrap.sh identities`.

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

## Database pods across releases

The staging overlay runs one pod per data StatefulSet (`mysql`, `redis`,
`redis-sentinel`, `mongo-dlq`, `mongo-audit`) and one per observability StatefulSet (`alertmanager`,
`grafana`, `loki`, `prometheus`; issue #709). A rolling update deletes that pod
before its replacement starts, so a release that changes their pod template
(3.1.0: exporter sidecars) would cut the database for the stop, the image pull
and the start (up to 30 min for MySQL here). The `staging-local` overlay sets
`updateStrategy.rollingUpdate.partition: 1` on these nine (issues #700, #709,
enforced by `tests/k8s/check-overlays.mjs`):

- a deploy never restarts them: their pods keep UID, restart count and the pod
  template of their revision; `kubectl rollout status` reports the partitioned
  rollout complete, so `deploy-release.sh wait` and the first-deploy migration
  step go on;
- a new cluster (or a deleted StatefulSet) gets the current template;
- a pod deleted or evicted comes back with the template of its revision, not
  the newest one;
- until restarted, the pods lack what the new template adds. 3.1.0: no
  exporter, so no Prometheus target and no `mysql_up` / `redis_up` /
  `mongodb_up` series. `MySQLDown`, `RedisDown` and `MongoDBDown` stay silent
  (no series, no alert): a database outage is then only seen by the services'
  own alerts.

To take a new template, plan the restart (database down meanwhile) outside a
deploy. Release `redis` and `redis-sentinel` together: a Redis node restarted
alone waits for the master its sentinel still names, the dead pod (PR #579).

```bash
NS=trading-model-staging
for sts in redis redis-sentinel; do   # or: mysql, mongo-dlq, mongo-audit, alertmanager, grafana, loki, prometheus (one at a time)
  kubectl -n "$NS" patch sts "$sts" -p '{"spec":{"updateStrategy":{"rollingUpdate":{"partition":0}}}}'
done
for sts in redis redis-sentinel; do kubectl -n "$NS" rollout status "sts/$sts" --timeout=1800s; done
for sts in redis redis-sentinel; do
  kubectl -n "$NS" patch sts "$sts" -p '{"spec":{"updateStrategy":{"rollingUpdate":{"partition":1}}}}'
done
```

The next deploy sets the partition back to 1 anyway (it is in the overlay).
Check the result: `kubectl -n "$NS" get sts <x> -o jsonpath='{.status.currentRevision} {.status.updateRevision}'`
prints the same revision twice.

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
