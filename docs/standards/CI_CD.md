# CI/CD Standards

## Why

Continuous integration and continuous deployment automate quality controls, guarantee reproducible builds, and produce consistent releases. Every change is validated by a battery of checks before reaching production.

## CI: Continuous Integration

### Workflow: `.github/workflows/ci.yml`

Triggered on **push** and **pull request** to all branches.

```yaml
name: CI

on: [push, pull_request]

permissions:
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 'lts/*'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 'lts/*'
          cache: 'npm'
      - run: npm ci
      - run: npm run build --if-present
      - run: npm run test:coverage
```

**Jobs**:

- `lint` — ESLint across the entire monorepo
- `test` — Build + tests with coverage

**Permissions**: `contents: read` (read-only)

## CD: Continuous Deployment

### Workflow: `.github/workflows/release.yml`

Triggered on **tags** matching `v*.*.*`.

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 'lts/*', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test:coverage
      - name: Extract version from tag
        id: version
        run: echo "version=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"

  docker:
    needs: [quality]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        service:
          - name: discovery-server
            context: .
            dockerfile: services/discovery-server/Dockerfile
          - name: message-manager
            context: .
            dockerfile: services/message-manager/Dockerfile
          - name: financial-scraper
            context: .
            dockerfile: services/financial-scraper/Dockerfile
          - name: trader-trainer
            context: .
            dockerfile: services/trader-trainer/Dockerfile
    steps:
      - uses: actions/checkout@v5
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_TOKEN }}
      - uses: docker/setup-buildx-action@v3
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}/${{ matrix.service.name }}
          tags: |
            type=semver,pattern={{version}},value=v${{ needs.quality.outputs.version }}
            type=semver,pattern={{major}}.{{minor}},value=v${{ needs.quality.outputs.version }}
            type=semver,pattern={{major}},value=v${{ needs.quality.outputs.version }}
            type=sha
      - uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.service.context }}
          file: ${{ matrix.service.dockerfile }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  release:
    needs: [quality, docker]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v5
      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref_name }}
          name: Release ${{ needs.quality.outputs.version }}
          generate_release_notes: true
```

**Jobs** (sequential):

1. `quality` — Lint + Build + Tests + version extraction
2. `docker` — Build and push Docker images for each service to GHCR (GitHub Container Registry)
3. `release` — Create GitHub Release with changelog

**Permissions**:

- CI (`ci.yml`): `contents: read`
- Quality (`release.yml`): `contents: read`
- Docker (`release.yml`): `contents: read` + `packages: write`
- Release (`release.yml`): `contents: write`

### CI/CD Pipeline Summary

| Workflow    | File                            | Trigger                | What it does                                         |
| ----------- | ------------------------------- | ---------------------- | ---------------------------------------------------- |
| **CI**      | `.github/workflows/ci.yml`      | `push`, `pull_request` | Lint → Build → Test                                  |
| **Release** | `.github/workflows/release.yml` | tag `v*.*.*`           | Quality gate → Docker images → GHCR → GitHub Release |

All workflows run on `ubuntu-latest` with Node.js LTS and npm cache. Failure in any workflow blocks merging.

## Docker: Multi-stage Builds

All services use the same Docker pattern:

```dockerfile
# Example: services/discovery-server/Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/discovery-server/package.json services/discovery-server/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/discovery-server/ services/discovery-server/
RUN npm ci
RUN npm run build:common
WORKDIR /app/services/discovery-server
RUN npx tsc

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/discovery-server/package.json ./services/discovery-server/
COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/services/discovery-server/dist ./services/discovery-server/dist
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/discovery-server/dist/app/index.js"]
```

**Docker Conventions**:

- **Base image**: `node:20-alpine`
- **Init system**: `tini` (`/sbin/tini`) for signal handling
- **TLS Alpine**: Alpine's musl libc includes native TLS support
- **Multi-stage build**: `deps` (prod deps) → `build` (dev deps + compilation) → `runtime` (minimal)
- **Port**: 3000 (exposed in container)
- **Context**: Root of monorepo (`.`)
- **Caching**: GitHub Actions cache for layers (via `docker/build-push-action`)

## Development to Production Workflow

```
dev  ──→ commit ──→ push ──→ PR ──→ merge ──→ beta deploy
        npm run     git push  (auto      dev
        commit                 lint               docker compose
                               build               pull + up -d
                               test)

main ←── merge dev ────→ tag ──→ stable deploy
              (if OK)     npm run   docker compose
                          release   pull + up -d
```

### Beta Deployment (development branch)

After merging into `development`, canary deployment is available:

```bash
# On the beta server (PowerShell - Windows)
.\scripts\deploy-beta.ps1

# On the beta server (Bash - Linux / macOS / CI)
bash scripts/deploy-beta.sh
```

Canary percentage and error threshold can be overridden:

```bash
.\scripts\deploy-beta.ps1 -CanaryPercent 5 -ErrorThreshold 0.03
bash scripts/deploy-beta.sh --canary 5 --threshold 0.03
```

### Stable Deployment

On the production server:

```bash
git pull --tags
git checkout v$(node -p "require('./package.json').version")
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose pull
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose up -d
```

Verify:

```bash
docker compose ps
curl -k https://localhost:8443/ping
docker compose logs -f
```

## Sensitive Variables (GitHub Secrets)

| Secret       | Usage                                                            |
| ------------ | ---------------------------------------------------------------- |
| `GHCR_TOKEN` | GitHub token with `write:packages` scope for Docker push to GHCR |

### Setting up GHCR_TOKEN

The `release.yml` workflow uses `${{ secrets.GHCR_TOKEN }}` to authenticate with GitHub Container Registry.

1. Create a classic [Personal Access Token](https://github.com/settings/tokens) with the `write:packages` scope
2. Add it as a repository secret named `GHCR_TOKEN` at: `https://github.com/<owner>/<repo>/settings/secrets/actions`

> **Note:** The `GITHUB_TOKEN` automatically available in workflows has `packages: write` permission on the `docker` job, but must be explicitly enabled via `permissions.packages: write` (already set in `release.yml`).

## References

- [PR.md](./PR.md) — Required checks before merge
- [QUALITY.md](./QUALITY.md) — Quality thresholds
- `.github/workflows/ci.yml` — CI workflow
- `.github/workflows/release.yml` — Release workflow
- [CONTRIBUTE.md](../deployment/CONTRIBUTE.md) — Full development workflow
