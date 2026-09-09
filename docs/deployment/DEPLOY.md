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
| `image_tag` | Image tag to deploy (defaults to `staging` / `latest`) |
| `canary` | Run canary + smoke test with automatic rollback on failure |

### Prerequisites (secrets)

Add the cluster kubeconfigs as base64-encoded repository secrets:

| Secret | Purpose |
|--------|---------|
| `KUBECONFIG_STAGING` | kubeconfig for the staging cluster |
| `KUBECONFIG_PRODUCTION` | kubeconfig for the production cluster |

### Deployment phases

```
1. Configure kubectl (kubeconfig from secret)
2. Run database migrations (migration-job.yaml) before rollout
3. Apply overlay (deploy/k8s/overlays/<env>)
4. Wait for rollout of all services
5. Canary + smoke test (if enabled) → rollback on failure
```

Rollback on failure is automatic: the workflow undoes the deployment rollouts.

---

## Using pre-built images (production)

Instead of building locally, pull published images from GHCR:

```bash
# Authenticate to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u <USERNAME> --password-stdin

# Pull all services
IMAGE_TAG=2.0.3 docker compose pull

# Or pull a specific service
docker pull ghcr.io/trading-model/discovery-server:2.0.3
```

## Production deployment

1. A tag `v*.*.*` is pushed on `main`
2. `release.yml` builds and publishes 8 images to `ghcr.io`
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
