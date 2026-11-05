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
| `image_tag` | Required: release to deploy, `v1.2.3` or `1.2.3`. Staging also accepts `latest` (the highest stable release); production refuses anything but a release, before the cluster is reached. Resolved to image digests before anything is applied |
| `canary` | Run canary + smoke test with automatic rollback on failure |

### Source of the manifests and migrations

When `image_tag` is a release (`v1.2.3` or `1.2.3`), the workflow checks out
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

Add the cluster kubeconfigs as base64-encoded secrets of the GitHub
**environment** (Settings → Environments → `staging` / `production`), never as
repository secrets: a repository secret can be read by any workflow of any
branch, an environment secret only by a job that passes the environment's
protection rules.

| Secret | Environment | Purpose |
|--------|-------------|---------|
| `KUBECONFIG_STAGING` | `staging` | kubeconfig for the staging cluster |
| `KUBECONFIG_PRODUCTION` | `production` | kubeconfig for the production cluster |

Protect the `production` environment (Settings → Environments → `production`):

- **Required reviewers**: at least one person other than the one who starts the
  deploy; enable "Prevent self-review".
- **Deployment branches and tags**: "Selected branches and tags", with the tag
  rule `v*` only. A deploy dispatched from a working branch is then refused
  before any secret is read: pick the release tag in "Use workflow from".

These settings are made by hand in GitHub; the workflow cannot check them.

### Prerequisites (off-site backup bucket)

Once per environment, before the first `db-backup` run: set the bucket's
lifecycle rules for `daily/`, `weekly/`, `monthly/` and the two archive
prefixes, then read them back
([BACKUP_DR.md, Off-site tiers](BACKUP_DR.md#off-site-tiers), ADR-0032).
Nothing in the deployment checks them: the `backup-tools` image has no `aws`
CLI, so each backup run only logs "Off-site lifecycle rules not verified". A
missing rule loses nothing, but those copies are then never expired.

### Deployment phases

```
0. Resolve the release ref (production: vX.Y.Z only) and check out its tag
1. Configure kubectl (kubeconfig from secret)
2. Resolve every image tag to a digest (fails if the release was not published)
3. Check sealed secrets (production: controller CRD present, no placeholder)
   Check ingress hosts (production: no example.com host left, see KUBERNETES.md "Set the Ingress hosts"; staging: warning)
4. Apply SPIFFE node components, run database migrations (existing cluster: `MYSQL_MIGRATE_PASSWORD` must be in `trading-model-secrets` first; production fails with an explicit error if it is not sealed, staging seeds a random one that the overlay replaces; production first applies `deploy/k8s/secrets/trading-model-sealed-secrets.yaml` and waits for the controller to create the key; if the file lacks it, seal ONLY that key: `init-sealed-secrets.sh` draws random values for every key not provided, `MYSQL_ROOT_PASSWORD` included, which would no longer match the initialised MySQL)
5. Canary gate on live traffic (if enabled)
6. Apply overlay (deploy/k8s/overlays/<env>, images pinned by digest)
7. Wait for rollout of all services, smoke test
```

Rollback on failure is automatic: the workflow returns every Deployment to the
revision it ran before the overlay (`rollout undo --to-revision`, see
[Rollback](#rollback)). The overlay is applied by digest, so this returns to the
previous image even when both deploys used `latest`.

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

1. `bun run release:publish` (on `main`) bumps the versions, writes the CHANGELOG and pushes the tag `vX.Y.Z` ([release.md](../contributing/release.md))
2. `release.yml` runs the whole CI on the tag, then publishes the 10 images to `ghcr.io/<owner>` as `X.Y.Z`, and as `latest` when it is the highest stable release
3. The `Deploy` workflow is run against the `production` environment (canary enabled for staged rollout)

---

## Replicas and the HPA

A Deployment driven by an HPA carries no `spec.replicas` in `deploy/k8s/services/` (`check-overlays.mjs` enforces it): an apply must not reset the pod count the HPA chose. `minReplicas` is the floor; staging pins every HPA to 1 pod. The `financial-scraper-collector` (no HPA) keeps `replicas: 1`.

Moving an existing cluster over: `deploy.yml` (step "Release replicas of autoscaled Deployments") removes `spec.replicas` from `kubectl.kubernetes.io/last-applied-configuration` before the apply, otherwise the apply would drop the Deployment to 1 pod. By hand: `kubectl apply edit-last-applied deployment/<name> -n <ns>` and delete the `replicas` line, before applying the new overlay.

## Rollback

Rollback is automatic on failure in the `Deploy` workflow. Before applying the
overlay it records the revision of each of the 9 Deployments; on failure it
runs `kubectl rollout undo --to-revision=<recorded>` for each of them.

What the rollback restores:

- the image of every Deployment (by digest);
- the service configuration: the ConfigMaps read through `envFrom`
  (`<service>-config`, from `deploy/k8s/config/<service>.properties`) and the
  edge-proxy nginx config are generated by kustomize with a content hash in
  their name. A pod template names the ConfigMap of its release, so returning
  to revision N returns to the configuration of N. The old ConfigMaps stay in
  the namespace: nothing prunes them, so every ReplicaSet revision finds its
  own. A configuration change alone also rolls the Deployments that read it.

What it does not restore (still at N+1 after a rollback):

- StatefulSets (MySQL, MongoDB, Redis...), CronJobs, Jobs, HPAs, PDBs,
  NetworkPolicies, Services, the SPIFFE node agents (`trading-model-node`) and
  the fixed-name ConfigMaps (`spiffe-helper-config`, infrastructure configs,
  `backup-encryption`);
- the database schema: migrations already applied stay applied.

To bring everything back to N, run the `Deploy` workflow again from the git
ref of release N with its image tag: it re-applies the overlay of N, pinned to
the digests of N.

A Deployment created by the failed deploy (first deploy) has no earlier
revision: the step reports an error for it and leaves it in place.

The canary (`deploy-k8s.sh canary`) copies the running pod template, so it runs
the new image with the configuration of the current release, not the new one.

`deploy-k8s.sh migrate-down` provisions `migrator` itself (job `db-migrate-user`) before rolling the schema back; pass `MIGRATE_IMAGE` of the release being rolled back. Outside `deploy.yml`, set `SEED_MIGRATE_PASSWORD=true` (staging) or `SEALED_SECRETS_FILE=deploy/k8s/secrets/trading-model-sealed-secrets.yaml` (production) when the key is missing. On staging the seeded `migrator` password stays random until the next deploy applies the overlay; no functional effect.

Redeploying a tag published before `db-migrate` existed works: the workflow checks out that tag, so its own `deploy.yml` (its own `IMAGES` list) and manifests (root migrations) are used. Only the `Deploy` workflow of the old tag matters, not the current one.

### Canary gate

`deploy.yml` runs `deploy-k8s.sh canary-all`: the 7 canaries are created in
parallel and observed over one `CANARY_GATE_SECONDS` window (default 120 s), so
the step lasts one rollout plus one window, not 7 of each. Every failing gate is
reported and every canary is removed if one fails.

| GitHub variable | Default | Meaning |
|---|---|---|
| `CANARY_GATE_SECONDS` | `120` | Observation window |
| `CANARY_MIN_REQUESTS` | `20` | Real requests a canary must serve: fewer is a failure (no signal is not a pass) |
| `CANARY_ERROR_THRESHOLD_PCT` | `5` | Maximum 4xx/5xx share |
| `CANARY_READINESS_ONLY` | `dlq-service` | Comma-separated services whose gate checks readiness and routing only |

`dlq-service` is readiness-only: it only receives requests on a dead letter or an
admin call, so a healthy environment gives it no traffic. Add a service to
`CANARY_READINESS_ONLY` only for the same reason. Test of the gate:
`bash tests/k8s/canary-gate.test.sh`.

For a manual rollback, revert a service to a previous revision:

```bash
kubectl rollout undo deployment/<service> -n trading-model
```

Or via the deploy script:

```bash
./deploy/k8s/scripts/deploy-k8s.sh rollback <service>
```
