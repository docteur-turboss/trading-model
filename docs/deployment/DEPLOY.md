# Deployment

## Local deployment (development)

Create `.env` first, then replace the example values of `MYSQL_ROOT_PASSWORD`, `GATEWAY_AUTH_TOKENS` and `SIGNING_SECRET` (see [SETUP.md](SETUP.md#5-configure-environment)): without them the gateway and discovery-server refuse to start.

Start all services:

```bash
cp .env.example .env   # then replace the example values
docker compose up -d
```

Follow logs:

```bash
docker compose logs -f
```

Stop:

```bash
docker compose down
```

Stop **and delete volumes** (data loss):

```bash
docker compose down -v
```

---

## Kubernetes deployment (GitHub Actions)

Deployments to Kubernetes are managed through the `Deploy` GitHub Actions workflow
(`.github/workflows/deploy.yml`). This replaces the old SSH fleet script (`deploy-beta.sh`).

### Trigger

Open the **Actions** tab → **Deploy** → **Run workflow**, then select:

| Input | Description |
|-------|-------------|
| `environment` | `staging` or `production` |
| `image_tag` | Required: release to deploy, `v1.2.3` or `1.2.3` (prerelease `v1.2.3-rc.1` or `1.2.3-rc.1` too). Staging also accepts `latest` (the highest stable release); production refuses anything but a release, before the cluster is reached. Resolved to image digests before anything is applied |
| `canary` | Run canary + smoke test with automatic rollback on failure |
| `preflight_only` | Run every prerequisite guard and a server-side dry-run of the apply, change nothing: see [Preflight](#preflight) |

### Preflight

`preflight_only: true` runs the same guard steps as a real deploy, but each one
goes on after a failure, then sends what the three apply steps would send
(cluster-scope objects and SPIFFE node components with `deploy-cluster`, the
overlay with `deploy-app`, ADR-0041) through `kubectl apply --dry-run=server`
(`deploy-release.sh dry-run`). Every step that writes (applies, Secrets and
ConfigMaps, migrations, canary, rollback, annotations) and the Slack events are
skipped. The run summary lists every guard with its result
(`scripts/preflight-summary.sh`, names and outcomes only, never a secret
value); the job fails when one of them would stop a real deploy, and the reason
of each failure is the annotation of its step. Staging warnings stay warnings.

- Missing GitHub environment (or production protection unreadable without
  `ENVIRONMENT_READ_TOKEN`): the preflight stops in `check-environment`, since a
  job naming the environment would make GitHub create it unprotected.
- First deploy (namespace absent): the application part of the dry-run is
  skipped with a warning; the cluster part and the node agents still run.
- A protected environment still asks its reviewers to approve the preflight
  job: it reads the environment secrets.
- The CI `k8s` job runs `deploy-release.sh dry-run` with both identities before
  the upgrade and checks that no Deployment changed.

In production a MySQL-only `db-backup` Job runs before the migrations; its end time, in the run summary, is the `--until` point of `restore-k8s.sh` after a failed migration.

### Source of the manifests and migrations

When `image_tag` is a release (`v1.2.3`, `1.2.3`, or a prerelease such as `v1.2.3-rc.1`), the workflow checks out
the git tag `refs/tags/v1.2.3`, whatever branch it was dispatched from: the
overlay, the node agents and the migrations applied are those of the release
the images come from. The job log prints the commit (`Manifests and migrations
from <sha>`), and the deployments are annotated with it
(`trading-model.dev/git-sha`).

Staging with `latest` keeps the dispatch ref and logs a warning: the manifests
may then not match the images.

The workflow runs the scripts of the checked-out tag (`scripts/backup-*-check.sh`,
`deploy/k8s/scripts/*`). A tag older than one of them fails the deploy: deploy
that release with the workflow it was tagged with, or release again.

### Prerequisites (secrets)

The environment `staging` currently targets a local kind cluster through a
self-hosted runner: [STAGING_LOCAL.md](STAGING_LOCAL.md) (`STAGING_RUNNER`, `K8S_OVERLAY`).

Add the cluster kubeconfigs (two per environment, see
[Deploy identities](#deploy-identities)) as base64-encoded secrets of the GitHub
**environment** (Settings → Environments → `staging` / `production`), never as
repository secrets: a repository secret can be read by any workflow of any
branch, an environment secret only by a job that passes the environment's
protection rules.

| Secret | Environment | Purpose |
|--------|-------------|---------|
| `KUBECONFIG_STAGING_APP` | `staging` | `deploy-app`: application namespace only |
| `KUBECONFIG_STAGING_CLUSTER` | `staging` | `deploy-cluster`: namespaces, ClusterRoles, node-agents |
| `KUBECONFIG_PRODUCTION_APP` | `production` | same, production cluster |
| `KUBECONFIG_PRODUCTION_CLUSTER` | `production` | same, production cluster |

Protect the `production` environment (Settings → Environments → `production`):

- **Required reviewers**: at least one person other than the one who starts the
  deploy; enable "Prevent self-review".
- **Deployment branches and tags**: "Selected branches and tags", with the tag
  rule `v*` only. A deploy dispatched from a working branch is then refused
  before any secret is read: pick the release tag in "Use workflow from".

These settings are made by hand in GitHub, then checked: the `check-environment`
job of `deploy.yml` (no `environment:`, so it runs before any approval or
secret) fails a production deploy when the environment is missing, has no
required reviewer, allows self-review or has no `v*` tag rule
(`scripts/check-environment-protection.mjs`). Reading these settings needs
admin rights, so create the repository secret `ENVIRONMENT_READ_TOKEN`
(fine-grained PAT, repository permission "Administration: read", this
repository only).

Also limit the other two environments that hold secrets (issue #847; without a
branch rule anyone with write access can push a branch whose workflow names the
environment and prints its secrets):

- `staging` (`KUBECONFIG_STAGING_*`, `BACKUP_S3_*`, `AUDIT_ANCHOR_*`): "Selected
  branches and tags" with exactly the branches `development` and `main`.
  A required reviewer is advised, not checked.
- `backup-key-check` (`BACKUP_ESCROW_AGE_IDENTITY`, the key that decrypts every
  backup): "Selected branches and tags" with exactly the branch `main`, and at
  least one required reviewer. Set both **before** storing the escrow key. The
  weekly run then waits for the reviewer's approval.

The expected rules are the `RULES` table of the script. `backup-key-check.yml`
runs its own `check-environment` job first and `verify-escrow-key` (the only
job that reads the key) depends on it: a missing rule, a missing
`ENVIRONMENT_READ_TOKEN` or an unreadable setting fails the run before the key
is released. For a staging deploy the same check reports `::error::` in the
preflight summary but never blocks the deploy (the token or the rule may be
missing on a first local setup; the runner-approval check below blocks).
Exception: a staging deploy on the self-hosted runner
(`STAGING_RUNNER` set) fails when fork pull request workflows do not need
approval for all external contributors, or when the token cannot read that
setting ([STAGING_LOCAL.md](STAGING_LOCAL.md#runner-isolation), issue #842).

**Before the first production deploy**, the operating entity fills the `Controller` and `Contact` fields of the [data processing register](../compliance/data-processing-register.md) (Art. 30(1)(a)); the [privacy notice](../compliance/privacy-notice.md) points to them. The repository is public: commit no personal data, name the entity as your legal process requires.

### Deploy identities

No admin kubeconfig is stored in GitHub (ADR-0041). With an admin kubeconfig,
once per environment and again before the token expires:

```bash
bash scripts/deploy-identity.sh app     --namespace trading-model | base64 -w0 | gh secret set KUBECONFIG_PRODUCTION_APP     --env production
bash scripts/deploy-identity.sh cluster --namespace trading-model --environment production | base64 -w0 | gh secret set KUBECONFIG_PRODUCTION_CLUSTER --env production
```

**Upgrading to 3.1.0** (existing environment): run both commands again, not only `cluster`. The Role `deploy-app` gained `leases` (collector Lease, ADR-0057) and the identity cannot grant itself rights. The step "Check deploy-app Role" (`deploy/k8s/scripts/check-app-rbac.sh`) compares the live Role with `app-role.yaml` before any apply and stops with the command when they differ (staging-local: `bash deploy/staging-local/bootstrap.sh identities`).

| Identity | Rights | Used by |
|----------|--------|---------|
| `deploy-app` | Role `deploy/k8s/deploy-identity/app-role.yaml` in the application namespace | every step except the four below |
| `deploy-cluster` | ClusterRole `cluster-role.yaml` (read-only on ClusterRoles and their bindings) + Roles in the node-agents and Sealed Secrets namespaces | "Apply cluster-scope objects", "Check sealed secrets" (CRD, controller), "Check cluster prerequisites" (CRDs, StorageClass, IngressClass, ClusterIssuer), "Apply SPIFFE node components" |

- **Token rotation.** The token is bounded (`--duration`, default 168 h; the
  API server may cap it). Rerun the script and replace the secret before expiry.
  An expired token fails the deploy at "Configure kubeconfigs", before any
  change. On a suspected leak add `--revoke`: the ServiceAccount is recreated and every
  token issued before stops working.
- **Workload ClusterRoles.** The cluster script also applies, as admin, the
  ClusterRoles and ClusterRoleBindings of the overlays of `--environment`
  (`spire-server`, `spire-agent`, `promtail`): `deploy-cluster` can only read
  them, so it cannot grant itself `nodes/proxy` (kubelet API). When a release
  changes one of them, run the cluster script again before the deploy, or it
  fails at "Apply cluster-scope objects" / "Apply SPIFFE node components"
  (forbidden).
- **The cluster secret stays sensitive.** `deploy-cluster` deploys the node
  agents (DaemonSets in the privileged `trading-model-node` namespace): a leak
  is close to root on every node (ADR-0041). Prefer a short `--duration` for
  production (for example `24h`, renewed before each deploy).
- **A new kind in an overlay** fails `node tests/k8s/check-overlays.mjs` until
  the role file lists it; rerun the script to update the Role in the cluster.
- **OIDC (recommended when the provider allows it).** Trust
  `https://token.actions.githubusercontent.com` in the cluster, map the claims
  `repo` and `environment` of the `production` job to RBAC subjects bound to the same
  Role and ClusterRole, and drop the static secrets. Provider-specific, not done by the
  repository.
- **Human settings** (cannot be checked by the workflow): required reviewer on
  `production` (above), and a second CODEOWNER on `/.github/`, `/deploy/` and
  `/deploy/k8s/secrets/` in `.github/CODEOWNERS` (only `@docteur-turboss` today).

### Prerequisites (off-site backup bucket)

Once per environment, before the first `db-backup` run: set the bucket's
lifecycle rules for `daily/`, `weekly/`, `monthly/` and the two archive
prefixes, then read them back
([BACKUP_DR.md, Off-site tiers](BACKUP_DR.md#off-site-tiers), ADR-0032).
`deploy.yml` (`backup-bucket-check.sh`) checks the `daily/`, `weekly/` and
`monthly/` rules. A missing rule loses nothing, but those copies are then never
expired.

### Deployment phases

```
0. Resolve the release ref (production: vX.Y.Z or vX.Y.Z-rc.N only) and check out its tag
1. Configure kubectl (two kubeconfigs: application and cluster-scope, from secrets)
2. Resolve every image tag to a digest (fails if the release was not published)
3. Check sealed secrets (production: controller CRD present, no placeholder)
   Check ingress hosts (production: no example.com host left, see KUBERNETES.md "Set the Ingress hosts"; staging: warning), and no `PLACEHOLDER` left in the rendered `realip.inc` (production: `deploy/k8s/overlays/production/realip.inc`; staging: warning)
4. (Retention: seal `MYSQL_RETENTION_PASSWORD` in the production SealedSecret beforehand, [BACKUP_DR.md](BACKUP_DR.md#retention-job).) Apply cluster-scope objects (namespace, ClusterRoles), SPIFFE node components, run database migrations (existing cluster: `MYSQL_MIGRATE_PASSWORD` must be in `trading-model-secrets` first; both environments fail with an explicit error if it is not sealed; the deploy first applies the environment's SealedSecret (`deploy/k8s/secrets/trading-model-sealed-secrets.yaml`, staging `deploy/k8s/overlays/staging/sealed-secrets.yaml`) and waits for the controller to create the key; if the file lacks it, add ONLY that key with `kubeseal --merge-into` (see `sealed-secrets.md`, "Adding one key"): a single-key SealedSecret erases the other keys of the live Secret, and `init-sealed-secrets.sh` draws random values for every key not provided, `MYSQL_ROOT_PASSWORD` included; the script refuses a file missing a live key)
5. Canary gate on live traffic (if enabled)
6. Apply overlay (deploy/k8s/overlays/<env>, images pinned by digest; namespaced part, application identity)
7. Wait for rollout of all services, smoke test, `verify-market-data`, then `verify-release` (see "Release verification")
```

**Ingestion during a release.** `financial-scraper-collector` keeps one pod
(`replicas: 1`, no HPA) and rolls out with `RollingUpdate`, `maxUnavailable: 0`,
`maxSurge: 1` (ADR-0057). The new pod starts next to the old one and becomes
ready; only the holder of the Lease `financial-scraper-collector` runs the
crons. On SIGTERM the old pod stops its crons, drains its publishes in flight,
then releases the Lease; the new pod takes it within 2 s. The gap is the drain
plus the next cron tick: seconds, measured under 30 s by the kind job. The
`Verify market data resumed` step still waits up to 10 min for
`fs_candles_persisted_total` > 0 on the new pod. Production: failure and
rollback if it does not; staging: warning. Tune with
`MARKET_DATA_RECOVERY_TIMEOUT` / `MARKET_DATA_RECOVERY_MODE=warn`.
`CollectorNoLeader` fires if no pod holds the Lease for 2 min.

The first upgrade from a release without the Lease (3.0.x) runs the old
collector, which has no Lease, next to the new one until the old pod stops:
both collect for up to about 30 s (ADR-0057, Consequences).

Rollback on failure is automatic: the workflow returns every Deployment to the
revision it ran before the overlay (`rollout undo --to-revision`, see
[Rollback](#rollback)). The overlay is applied by digest, so this returns to the
previous image even when both deploys used `latest`.

Two cases:

- **Failure or cancellation after "Apply overlay" started** (a cancel by hand,
  by `concurrency` or a lost runner counts): the rollback runs; the Slack event
  is `rolled-back`.
- **Failure before "Apply overlay"** (checks, migrations, canary, record): the
  Deployments were not touched, so no rollback runs. The run summary says so
  (step "Report state left before the overlay") and the Slack event is
  `failed-before-overlay`. Never undone automatically: cluster-scope objects,
  SPIFFE node components (`trading-model-node`), a SealedSecret applied for new
  keys, expand migrations (ADR-0040), Mongo init Jobs deleted by
  "Release replicas of autoscaled Deployments".

---

## Using pre-built images (development Compose host)

> **Not production.** Production runs on Kubernetes (see above). This Compose
> pull is for development hosts only, with no real data.

Instead of building locally, pull published images from GHCR:

```bash
# Authenticate to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u <USERNAME> --password-stdin

# Pull all services
IMAGE_TAG=2.0.3 docker compose pull

# Or pull a specific service
docker pull ghcr.io/<owner>/discovery-server:2.0.3
```

## Production deployment

### Before the first production deploy

Run the preflight (Actions → Deploy → `environment: production`, the release
tag, `preflight_only: true`) until it passes: it checks everything below that
the repository can check, and lists every gap in one run. What stays manual
(owner, with admin rights):

1. **GitHub environment `production`**: create it, required reviewers with
   "Prevent self-review", deployment tag rule `v*` only, and the repository
   secret `ENVIRONMENT_READ_TOKEN` ([Prerequisites](#prerequisites-secrets)).
2. **Cluster**: the operators and classes of
   [KUBERNETES.md](KUBERNETES.md) (CRDs, `rwx-csi`, IngressClass `nginx`,
   ClusterIssuer), the Sealed Secrets controller in namespace `sealed-secrets`
   (`scripts/install-sealed-secrets.sh`), the production pod CIDR in
   `realip.inc` and the real Ingress hosts.
3. **Deploy identities**: `bash scripts/deploy-identity.sh app` and
   `bash scripts/deploy-identity.sh cluster` as admin, again before each
   release that changes a ClusterRole; their kubeconfigs as the secrets
   `KUBECONFIG_PRODUCTION_APP` / `KUBECONFIG_PRODUCTION_CLUSTER`
   ([Deploy identities](#deploy-identities)).
4. **Sealed secrets**: `bash scripts/init-sealed-secrets.sh` then commit
   `deploy/k8s/secrets` (every key, including `MYSQL_MIGRATE_PASSWORD`,
   `MYSQL_RETENTION_PASSWORD`, the Redis ACL and exporter passwords:
   [sealed-secrets.md](sealed-secrets.md), [BACKUP_DR.md](BACKUP_DR.md#retention-job), ADR-0056).
5. **Environment secrets and variables**: `ALERTMANAGER_SLACK_WEBHOOK_URL`,
   `ALERTMANAGER_DEADMAN_URL`, `ALERTMANAGER_PUSHOVER_USER_KEY`,
   `ALERTMANAGER_PUSHOVER_TOKEN` (all four required in staging and production), `SIGNAL_CONTACT_EMAIL`,
   `BACKUP_AGE_RECIPIENTS` (two distinct keys), `BACKUP_S3_*` for an Object Lock
   bucket ([Prerequisites (off-site backup bucket)](#prerequisites-off-site-backup-bucket)), `AUDIT_ANCHOR_*` for the audit
   chain anchor bucket (ADR-0027).
6. **Compliance**: the `Controller` and `Contact` fields of the
   [data processing register](../compliance/data-processing-register.md).

Not checked by the preflight: the register, a
canary or a real rollout (the preflight never starts a pod).

### Each production release

1. Fill the `Controller` and `Contact` fields of the [data processing register](../compliance/data-processing-register.md) (Art. 30(1)(a); first production deploy only, see "Before the first production deploy" above)
2. `bun run release:publish` (on `main`) bumps the versions, writes the CHANGELOG and pushes the tag `vX.Y.Z` ([release.md](../contributing/release.md))
3. `release.yml` runs the whole CI on the tag, then publishes the 10 images to `ghcr.io/<owner>` as `X.Y.Z`, and as `latest` when it is the highest stable release; its last job, `verify-images`, fails if `deploy.yml` cannot resolve one of them.
4. The `Deploy` workflow is run against the `production` environment (canary enabled for staged rollout)

---

## Replicas and the HPA

A Deployment driven by an HPA carries no `spec.replicas` in `deploy/k8s/services/` (`check-overlays.mjs` enforces it): an apply must not reset the pod count the HPA chose. `minReplicas` is the floor; staging pins every HPA to 1 pod. The singleton `trader-trainer` (ADR-0044: training state in memory) has no HPA, keeps `replicas: 1` and surges one pod during a rollout, which serves the read routes at once and only trains once it holds the Lease `trader-trainer` (ADR-0058: the old pod ends its session after the current generation, stores and publishes its model, then releases it); `financial-scraper-collector` has no HPA, keeps `replicas: 1` and surges one pod during a rollout, which only collects once it holds the Lease (ADR-0057); `check-overlays.mjs` enforces both. `deploy-release.sh release-replicas` deletes the retired `trader-trainer-hpa` of older releases. A release pauses training for the end of one generation plus up to 2 s; the read routes keep answering. Deploying a tag older than ADR-0044 applies its manifests, so it brings `trader-trainer-hpa` back; `rollout undo` does not. If that first release fails, its rollback puts the N-1 Deployment back (`RollingUpdate`, its pod count) but not the deleted HPA: the trainer keeps its pods without autoscaling until the next successful deploy.

Moving an existing cluster over: `deploy.yml` (step "Release replicas of autoscaled Deployments") removes `spec.replicas` from `kubectl.kubernetes.io/last-applied-configuration` before the apply, otherwise the apply would drop the Deployment to 1 pod. By hand: `kubectl apply edit-last-applied deployment/<name> -n <ns>` and delete the `replicas` line, before applying the new overlay.

## Rollback

Rollback is automatic on failure in the `Deploy` workflow. Before applying the
overlay it records the revision of each of the 9 Deployments; on failure it
runs `kubectl rollout undo --to-revision=<recorded>` for each of them. These
steps (record, apply by digest, wait for rollout, rollback) live in
`deploy/k8s/scripts/deploy-release.sh`, which the CI `k8s` job runs too: it
deploys release N-1 on kind, forces a failed upgrade to N, checks every
Deployment is back on its N-1 pod template (image digests, ConfigMaps) with the
N-1 migrations still applied, runs `migrate-down 1` and the migrations again,
then upgrades to N (`tests/k8s/run-kind.sh upgrade`).

"Wait for rollout" gives each Deployment 180 s plus the
`terminationGracePeriodSeconds` of its pod template: a `Recreate` Deployment
starts its new pod only once the old one has drained, and a draining pod may
take its whole grace. A fixed 180 s declared such a healthy release
failed and rolled it back; the kind job found it (PR #460) and runs the same
timeouts as production.

What the rollback restores:

- the image of every Deployment (by digest);
- the Redis and Redis Sentinel StatefulSets (ADR-0047: the services' ACL
  credentials only work against nodes of their own release), rolled back first;
- the service configuration: the ConfigMaps read through `envFrom`
  (`<service>-config`, from `deploy/k8s/config/<service>.properties`) and the
  edge-proxy nginx config are generated by kustomize with a content hash in
  their name. A pod template names the ConfigMap of its release, so returning
  to revision N returns to the configuration of N. The old ConfigMaps stay in
  the namespace: nothing prunes them, so every ReplicaSet revision finds its
  own. A configuration change alone also rolls the Deployments that read it.

What it does not restore (still at N+1 after a rollback):

- the other Deployments (`spire-server`, whose `spire-entries` sidecar runs the
  `spire-tools` image of the release, and the infrastructure ones);
- the other StatefulSets (MySQL, MongoDB...), CronJobs, Jobs, HPAs, PDBs,
  NetworkPolicies, Services, the SPIFFE node agents (`trading-model-node`) and
  the fixed-name ConfigMaps (`spiffe-helper-config`, infrastructure configs,
  `backup-encryption`);
- the database schema: migrations already applied stay applied;
- the `kubectl.kubernetes.io/last-applied-configuration` annotation:
  `rollout undo` changes the pod template only, so the annotation still holds
  the manifest of N+1 (`kubectl` warns "Rolling back will not update ...").
  The next `kubectl apply` computes its patch from it; the next release's
  apply works (the kind job upgrades again after its rollback).

To bring everything back to N, run the `Deploy` workflow again from the git
ref of release N with its image tag: it re-applies the overlay of N, pinned to
the digests of N.

A Deployment created by the failed deploy (first deploy) has no earlier
revision: the step reports an error for it and leaves it in place.

The canary (`deploy-k8s.sh canary`) copies the running pod template, so it runs
the new image with the configuration of the current release, not the new one.

`deploy-k8s.sh migrate-down` provisions `migrator` itself (job `db-migrate-user`) before rolling the schema back; pass `MIGRATE_IMAGE` of the release being rolled back. Outside `deploy.yml`, set `SEALED_SECRETS_FILE` (the environment's SealedSecret file) when it carries a key the live Secret lacks: it is applied and waited for before the Jobs. `SEED_MIGRATE_PASSWORD=true` (random password) exists for the kind CI only, which has no Sealed Secrets controller.

Redeploying a tag published before `db-migrate` existed works: the workflow checks out that tag, so its own `deploy.yml` (its own `IMAGES` list) and manifests (root migrations) are used. Only the `Deploy` workflow of the old tag matters, not the current one.

### Canary gate

`deploy.yml` runs `deploy-k8s.sh canary-all`: the 6 canaries are created in
parallel and observed over one `CANARY_GATE_SECONDS` window (default 120 s), so
the step lasts one rollout plus one window, not 6 of each. The singletons
(`trader-trainer`, `financial-scraper-collector`) get no canary: it would be a
second pod (`check-overlays.mjs` enforces it). Every failing gate is
reported and every canary is removed if one fails.

| GitHub variable | Default | Meaning |
|---|---|---|
| `CANARY_GATE_SECONDS` | `120` | Observation window |
| `CANARY_MIN_REQUESTS` | `20` | Real requests a canary must serve: fewer is a failure (no signal is not a pass) |
| `CANARY_ERROR_THRESHOLD_PCT` | `5` | Maximum 4xx/5xx share |
| `CANARY_READINESS_ONLY` | `dlq-service` | Comma-separated services whose gate checks readiness and routing only |

Behind `edge-proxy` the canary share depends on connections, not requests: its
keep-alive pool to `api-gateway` (`deploy/edge-proxy/gateway-upstream.k8s.conf`)
pins a client to one pod, since kube-proxy picks the pod when a connection
opens. `canary_start api-gateway` therefore restarts `edge-proxy` once the
Service routes to the canary (a failed restart aborts the canary), so the gate
starts with fresh connections. The kind gate (`verify_canary`) still sends
bursts of 12 requests every 5 s because its client is serial.

`dlq-service` is readiness-only: it only receives requests on a dead letter or an
admin call, so a healthy environment gives it no traffic. Add a service to
`CANARY_READINESS_ONLY` only for the same reason. Test of the gate:
`bash tests/k8s/canary-gate.test.sh`.

### Release verification

After the smoke test, `deploy.yml` runs `deploy-k8s.sh verify-release`. Each pass checks
an API call through `edge-proxy` (`GET /v1/discovery-server/services`, 200 expected, with
the first `AUTH_TOKENS` key of the Secret `trading-model-secrets`: it goes through stdin
and is never printed), at least one candle persisted in the last 15 min
(`fs_candles_persisted_total`), and no `severity="critical"` alert firing in Prometheus
(`Watchdog` excluded). Passes repeat over an observation window; any failed pass fails the
step and triggers "Rollback on failure". Market data may be missing until the first pass
that sees it, but must be present on the last pass and never disappear after. A critical
alert already firing before the deploy does not fail the gate in staging: the step "Record
critical alerts firing before the deploy", before any cluster change, lists them with all
their labels (`deploy-k8s.sh firing-critical`) into `VERIFY_BASELINE_FILE`, and
`verify-release` only reports them, since a rollback cannot clear them (e.g. a backup alert
waiting for a production-only fix). An alert that differs by any label (another instance,
service, symbol...) still fails. In production that step refuses to start the deploy while a
critical alert fires; a hotfix meant to clear it runs with the `workflow_dispatch` input
`allow_firing_alerts` (default `false`): the step then logs the alerts and `github.actor` as
a warning and production uses the baseline as staging does. An alert of the baseline that resolves then fires again during the
deploy with the same labels stays reported only. Staging skips the market-data
check and ignores `MarketDataStale` (`VERIFY_REQUIRE_FRESH_DATA=false`, set by `deploy.yml`):
there, missing market data only warns (`Verify market data resumed`).

| Variable (GitHub environment) | Default | Role |
|---|---|---|
| `VERIFY_WINDOW_SECONDS` | `600` | Observation window (`0` = one pass) |
| `VERIFY_INTERVAL_SECONDS` | `60` | Pause between passes |
| `VERIFY_EXTERNAL_URL` | unset | Optional real ingress URL (`https://host`) also called with the key, once hosts are defined |

Test: `bash tests/k8s/verify-release.test.sh`; `tests/k8s/run-kind.sh verify` runs the same command.

For a manual rollback, revert a service to a previous revision:

```bash
kubectl rollout undo deployment/<service> -n trading-model
```

Or via the deploy script:

```bash
./deploy/k8s/scripts/deploy-k8s.sh rollback <service>
```

Schema: `deploy-k8s.sh migrate-down [N|all]`, see the runbook
[Database Rollback](../operations/runbooks/runbook-deployment-failure.md#database-rollback).
