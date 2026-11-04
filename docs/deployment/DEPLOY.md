# Deployment

## Local deployment (development)

Start all services:

```bash
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
| `image_tag` | Required: release to deploy, `v1.2.3` or `1.2.3`, or `latest` (the highest stable release). Resolved to image digests before anything is applied |
| `canary` | Run canary + smoke test with automatic rollback on failure |

### Prerequisites (secrets)

Add the cluster kubeconfigs as base64-encoded repository secrets:

| Secret | Purpose |
|--------|---------|
| `KUBECONFIG_STAGING` | kubeconfig for the staging cluster |
| `KUBECONFIG_PRODUCTION` | kubeconfig for the production cluster |

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
1. Configure kubectl (kubeconfig from secret)
2. Resolve every image tag to a digest (fails if the release was not published)
3. Check sealed secrets (production: controller CRD present, no placeholder)
4. Apply SPIFFE node components, run database migrations
5. Canary gate on live traffic (if enabled)
6. Apply overlay (deploy/k8s/overlays/<env>, images pinned by digest)
7. Wait for rollout of all services, smoke test
```

Rollback on failure is automatic: the workflow undoes the deployment rollouts.
The overlay is applied by digest, so `rollout undo` returns to the previous
image even when both deploys used `latest`.

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

1. `bun run release` (on `main`) bumps the versions, writes the CHANGELOG and pushes the tag `vX.Y.Z`
2. `release.yml` runs the whole CI on the tag, then publishes the 9 images to `ghcr.io/<owner>` as `X.Y.Z`, and as `latest` when it is the highest stable release
3. The `Deploy` workflow is run against the `production` environment (canary enabled for staged rollout)

---

## Rollback

Rollback is automatic on failure in the `Deploy` workflow (it undoes the deployment rollouts).

For a manual rollback, revert a service to a previous revision:

```bash
kubectl rollout undo deployment/<service> -n trading-model
```

Or via the deploy script:

```bash
./deploy/k8s/scripts/deploy-k8s.sh rollback <service>
```
