# Local staging (kind)

The GitHub environment `staging` deploys to a kind cluster on the operator's
machine. `deploy.yml` runs there on a self-hosted runner, since GitHub-hosted
runners cannot reach `127.0.0.1`. Production is unchanged: GitHub-hosted runner,
overlay `production`.

| Piece | Where |
|-------|-------|
| Cluster `trading-staging` (kind v0.27.0, as the CI `k8s` job) | `deploy/staging-local/kind.yaml` |
| MinIO (audit anchors, off-site backups) and the runner | `deploy/staging-local/docker-compose.yml`, project `trading-staging`, both on the Docker network `kind` |
| Overlay | `deploy/k8s/overlays/staging-local`: `staging` + self-signed TLS (`selfsigned-local`), Ingress allow-list `172.18.0.0/16`, audit-logger and backup CronJobs egress to MinIO `172.18.0.200:9000`, SealedSecret sealed for the kind controller, data StatefulSets held by a partition ([below](#database-pods-across-releases)) |
| Local secrets | `~/.trading-staging/env` (keys `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` required; `MINIO_IP`, `RUNNER_TOKEN` optional) and `~/.trading-staging/backup-age-identity.txt` (private age key of the staging backups): never committed |

The Ingress answers on `https://localhost:9443` (self-signed certificate).
The compose stack keeps `http://localhost:8449` (edge-proxy). It is deployed by the `deploy-compose.yml` workflow from a release tag (ADR-0086), which waits for a running `deploy.yml` of staging.

## Selection in deploy.yml

- Environment `staging`: deployment limited to the branches `development` and `main`
  and the tags `v*` (Settings → Environments → "Selected branches and tags", no other
  rule; the release deploys its tag, `--ref vX.Y.Z`). It
  holds `KUBECONFIG_STAGING_*`, `BACKUP_S3_*` and `AUDIT_ANCHOR_*`: without the rule
  a branch pushed by anyone with write access can print them (issue #847).
  `check-environment` reports a missing rule as `::error::` in the preflight
  summary without blocking the deploy ([DEPLOY.md](DEPLOY.md#prerequisites-secrets)).
- Repository variable `STAGING_RUNNER` (`trading-staging`): `runs-on` label of the
  staging job. Unset: `ubuntu-24.04`.
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

The kind node is bounded by `docker update` (12 GiB, no swap, 12 CPUs of the
20 GiB / 16 CPU VM; runner 2 GiB / 2 CPUs and MinIO 1 GiB / 1 CPU by
`mem_limit` in `docker-compose.yml`), so a staging memory leak stops at the
node instead of freezing the whole Docker VM (issue #2160). `docker update`
does not survive `kind delete cluster`: rerun it after `kind create cluster`.
Raise it with the VM size; check `docker stats --no-stream` after a deploy.

`deploy.yml` checks out the release tag: a tag older than the `staging-local`
overlay cannot be deployed this way. Its scripts come from the tag too, so
`DEPLOY_TIMEOUT_FACTOR` only reaches the migration Jobs and rollouts of a tag
that has it (3.0.1 and later); the MySQL wait is in `deploy.yml` itself.

## Setup, once

```bash
kind create cluster --config deploy/staging-local/kind.yaml
docker update --memory 12g --memory-swap 12g --cpus 12 trading-staging-control-plane   # kind has no limit setting (issue #2160)
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

MinIO's region is `eu-west-3` (`MINIO_SITE_REGION` in the compose file), so
the checks of `backup-bucket-check.sh` and `deploy.yml` see an EU region. To
change it, in this order:

1. Restart MinIO: `docker compose -p trading-staging -f deploy/staging-local/docker-compose.yml --env-file ~/.trading-staging/env up -d minio`
2. Check: `aws --endpoint-url http://127.0.0.1:9000 s3api get-bucket-location --bucket trading-staging-backup` returns `eu-west-3`.
3. Set `BACKUP_S3_REGION` and `AUDIT_ANCHOR_REGION` to `eu-west-3` in the GitHub environment `staging`, and `BACKUP_S3_REGION` in `backup-key-check` and `sealed-secrets-key-backup`.
4. Redeploy staging. MinIO rejects signatures from another region, so the pods, `backup-key-check.yml` and `sealed-secrets-key-backup.yml` need the new value at the same time (until then `BackupOffsiteCopyFailed` fires and the audit anchors fail).

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
  is set, job `check-environment` (GitHub-hosted, always runs; also checks the environment protection) runs the same check, and
  the backup job `needs:` it, so the self-hosted runner never gets
  `SEALED_SECRETS_BACKUP_KUBECONFIG` or the MinIO credentials on failure
  (issue #860).
- `backup-key-check.yml` too: when `BACKUP_KEY_CHECK_RUNNER` is set, job
  `check-environment` (GitHub-hosted) runs the same check before
  `verify-escrow-key` gets the escrow key on this runner (issue #1135).
- Runner group limited to the workflows `deploy.yml`,
  `sealed-secrets-key-backup.yml` and `backup-key-check.yml` ("Selected workflows"): runner groups need an
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

**Accepted risk (project owner, 2026-11-23, issue #2182).** The runner stays
persistent: ephemeral mode needs a long-lived personal access token with
"Administration: read and write" that GitHub cannot create by API, and runner
groups need an organization. A runner compromised once stays compromised
between jobs and can steal the secrets of the next one: `KUBECONFIG_STAGING_*`,
the SealedSecrets backup kubeconfig and, while `BACKUP_KEY_CHECK_RUNNER` names
this runner, the escrow age identity (`BACKUP_ESCROW_AGE_IDENTITY`, ADR-0034).
The escrow check stays here only because the off-site store is the MinIO of
this cluster, which no GitHub-hosted runner reaches (issue #1135). The barriers
are the fork approval setting, checked before each of these jobs, and the purge
above after any doubt. When a real off-site bucket exists, delete the repository
variables `BACKUP_KEY_CHECK_RUNNER` (the escrow check then runs on
`ubuntu-latest`) and, once a production cluster exists,
`SEALED_SECRETS_BACKUP_RUNNER`. Never point `BACKUP_KEY_CHECK_RUNNER` at this
runner for any other bucket.

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
`updateStrategy.rollingUpdate.partition: 1` on seven of them (issues #700, #709,
enforced by `tests/k8s/check-overlays.mjs`). `prometheus` and `alertmanager` keep
partition 0 (issue #2323): held, they kept the rules and scrape jobs of the
release that created them (no `risk-execution` job, no risk alerts). A deploy
that changes their config restarts them: alerts and metrics pause for the
restart, the services do not.

- a deploy never restarts them: their pods keep UID, restart count and the pod
  template of their revision; `kubectl rollout status` reports the partitioned
  rollout complete, so `deploy-release.sh wait` and the first-deploy migration
  step go on;
- a new cluster (or a deleted StatefulSet) gets the current template;
- a pod deleted, evicted or restarted comes back with the template of its
  revision, not the newest one, but a ConfigMap it mounts by a bare name
  (no hash suffix) is read as the last deploy left it (issues #1456, #1460; enforced
  for every partitioned StatefulSet by `tests/k8s/check-overlays.mjs`);
- the Redis ACL written by `redis-ha.sh` reaches a partitioned `redis-0` only
  with the planned `redis` / `redis-sentinel` restart: code must not need a
  new Redis command in the release that grants it, nor a new ACL user
  (issue #1931);
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
for sts in redis redis-sentinel; do   # or: mysql, mongo-dlq, mongo-audit, grafana, loki (one at a time)
  kubectl -n "$NS" patch sts "$sts" -p '{"spec":{"updateStrategy":{"rollingUpdate":{"partition":0}}}}'
done
for sts in redis redis-sentinel; do kubectl -n "$NS" rollout status "sts/$sts" --timeout=1800s; done
for sts in redis redis-sentinel; do
  kubectl -n "$NS" patch sts "$sts" -p '{"spec":{"updateStrategy":{"rollingUpdate":{"partition":1}}}}'
done
```

The next deploy sets the partition back to 1 anyway (it is in the overlay).
Check the result on the pod, not on the StatefulSet status: with the partition at
or above the replica count, `currentRevision` equals `updateRevision` even when the
pod still runs an older template. `kubectl -n "$NS" get pod <x>-0 -o jsonpath='{.metadata.labels.controller-revision-hash}'`
must print the `updateRevision` of `kubectl -n "$NS" get sts <x> -o jsonpath='{.status.updateRevision}'`.

If the restarted pod never turns ready, the controller does not replace it
(`OrderedReady`): after fixing the template, delete the pod. If `redis-0` waits
for a master, restart the sentinels too (`kubectl -n "$NS" rollout restart sts/redis-sentinel`):
they still name the IP of the dead pod.

A failed deploy rolls `redis` back to the revision its pod ran (`deploy-release.sh
rollback`), which can be an older template than the last release: check the
image of `sts/redis` before a planned restart, and bring the release template back
with `kubectl -n "$NS" rollout undo sts/redis --to-revision=<n>` (revisions:
`kubectl -n "$NS" get controllerrevision | grep ^redis-`).

### Redis 7.4 to 8.x: rewrite the AOF first

Redis 8.10.3 (3.1.0) stops on an assertion (`listpack.c:1788
'lpValidateNext(lp, &p, lpbytes)' is not true`) while it replays an AOF
increment written by Redis 7.4.11 (3.0.0); 7.4.11 replays the same files. The
base RDB loads. Rewrite the AOF with 7.4 before the first start on 8.x, so the
increment is empty. No user may run `BGREWRITEAOF` (ACL of `redis-ha.sh`), so on
staging-local it was done offline on 2026-11-23 (issue #1982): `redis` scaled to
0, `appendonlydir` copied out of the PVC (`/var/local-path-provisioner/<pvc>` in
node `trading-staging-control-plane`), loaded in a throwaway `redis:7.4.11` with
`--appendonly yes`, `BGREWRITEAOF`, `SHUTDOWN`, checked in a throwaway
`redis:8.10.3` (same key count), copied back (owner 999; the old directory kept
as `appendonlydir.bak-7.4-20261123`), template set to 8.10.3, scaled to 1. Once
8.x has written its files, 7.4 cannot read them: a rollback of `redis` to the
3.0.0 template then fails the same way.

### Data tier switch (done 2026-11-23, issue #1982)

The pods of `mysql`, `mongo-dlq`, `mongo-audit`, `redis` and `redis-sentinel`
run the 3.1.0 templates: MySQL requires TLS with the cert-manager CA and its
users are bound to their client certificates (`run-migrations.sh "$NS"
user-only`), MongoDB runs with `--keyFile` and `--tlsMode`, `redis-0` has the
bus ACL users. The overlay no longer overrides any client (`DB_SSL_*`, MongoDB
URIs, `mysql-client-tls`, `BUS_TRANSPORT=http`). Until the first release that
contains this overlay is deployed, a deploy of an older tag brings the overrides
back: financial-scraper then loses `DB_SSL_*` and MySQL refuses it. Patch its
ConfigMap again:

```bash
cm=$(kubectl -n "$NS" get deploy financial-scraper -o jsonpath='{.spec.template.spec.containers[0].envFrom[0].configMapRef.name}')
kubectl -n "$NS" patch configmap "$cm" --type merge -p '{"data":{"DB_SSL_CA":"/etc/mysql-tls/ca.crt","DB_SSL_CERT":"/etc/mysql-tls/tls.crt","DB_SSL_KEY":"/etc/mysql-tls/tls.key"}}'
kubectl -n "$NS" rollout restart deploy/financial-scraper deploy/financial-scraper-collector
bash deploy/k8s/scripts/run-migrations.sh "$NS" user-only
```

Check that model-evaluator reads its topic in process:

```bash
kubectl -n "$NS" exec redis-0 -c redis -- sh -c 'REDISCLI_AUTH=$REDIS_MESSAGE_MANAGER_PASSWORD redis-cli --user message-manager XINFO CONSUMERS trading-model:message-manager:journal:training.model.published model-evaluator' | grep '^model-evaluator-'
```

## Between deploys

The cluster may be stopped between two deploys. Nothing calls it except
`deploy.yml` and, when `vars.SEALED_SECRETS_BACKUP_RUNNER` is set,
`sealed-secrets-key-backup.yml` (default `ubuntu-24.04`), and staging holds no data that
the compose stack or production needs. The price is a blind period: nothing
runs in the cluster while it is down.

```bash
docker stop trading-staging-runner trading-staging-control-plane trading-staging-minio
```

Start MinIO first (the audit anchors and backups write to it), then the node,
then the runner:

```bash
docker start trading-staging-minio trading-staging-control-plane
kubectl --context kind-trading-staging get pods -A    # wait until every pod is Running/Ready or Completed
docker start trading-staging-runner
```

Then run the smoke test: `bash deploy/k8s/scripts/deploy-k8s.sh -n trading-model-staging smoke-test`.

While it is down:

- `db-backup` (daily 02:00), `db-backup-incremental` (hourly, minute 30),
  `db-retention` (daily 03:30) and the audit-chain verification and anchoring
  (every 15 min, ADR-0027) do not run. No alert fires either, since Prometheus
  and Alertmanager are down.
- No PITR gap for a stop of hours or days: MySQL is down too, so nothing purges
  its binlogs (kept 4 days), and the first hourly run archives the closed ones.
  `BackupPitrGap` fires only if the stop outlasts that, or the MongoDB oplog
  window ("hours to days", `BACKUP_DR.md`, "Point-in-time archives") and overwrites
  entries before they are archived.
- After the start, with no run yet: `BackupIncrementalStale` after 2 h,
  `BackupJobStale` after 26 h, `RetentionStale` after 36 h,
  `AuditChainVerificationStale` / `AuditChainAnchoringStale` after 45 min,
  each plus its `for:` delay (`deploy/k8s/infra/config/alerting.yml`). They resolve on the next run.
- If `SEALED_SECRETS_BACKUP_RUNNER` is set, `sealed-secrets-key-backup.yml`
  (daily 03:30 UTC) needs the runner and the API server: its job stays queued or fails, and the key backup of that day is missing.
- Every pod restarts, including the single-replica data pods (see the partition
  above): expect the cold start of MySQL, Mongo and Redis before the smoke test
  passes. This is not measured; the smoke test waits `--timeout=120s` per Deployment
  (`deploy-k8s.sh`).
- `backup-key-check.yml` (Monday 07:00 UTC) needs the runner and MinIO while
  `BACKUP_KEY_CHECK_RUNNER` is set: its job stays queued or fails. CI runs on
  GitHub-hosted runners: not affected.

Stop it only when no backup window (02:00 to 04:00 UTC) matters to you, and
start it before a deploy: `deploy.yml` fails on the self-hosted runner otherwise.

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
  `MYSQL_EXPORTER_PASSWORD`, `REDIS_EXPORTER_PASSWORD`; the seven `MONGO_*` keys of
  ADR-0067: five passwords and `MONGO_AUDIT_KEYFILE` / `MONGO_DLQ_KEYFILE`,
  `openssl rand -hex 64`) must add it here too,
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
