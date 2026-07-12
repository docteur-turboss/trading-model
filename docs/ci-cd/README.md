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

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 'lts/*'
          cache: 'npm'
      - run: npm ci
      - name: Build packages (dependency order)
        run: npm run build
      - name: Type-check services
        run: |
          npm run -w services/message-manager build
          npm run -w services/discovery-server build
          npm run -w services/financial-scraper build
          npm run -w services/trader-trainer build
          npm run -w services/certificate-authority build
          npm run -w services/api-gateway build
          npm run -w services/admin-interface build
          npm run -w services/audit-logger build
          npm run -w services/dlq-service build
          npm run -w packages/certificate-utils build

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 'lts/*'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:coverage
```

**Jobs**:

- `lint` — Biome check across the entire monorepo
- `typecheck` — Build packages + type-check all services (including admin-interface)
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
          - name: certificate-authority
            context: .
            dockerfile: services/certificate-authority/Dockerfile
          - name: api-gateway
            context: .
            dockerfile: services/api-gateway/Dockerfile
          - name: admin-interface
            context: .
            dockerfile: services/admin-interface/Dockerfile
          - name: audit-logger
            context: .
            dockerfile: services/audit-logger/Dockerfile
          - name: dlq-service
            context: .
            dockerfile: services/dlq-service/Dockerfile
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

### Additional workflows

| Workflow      | File                                | Trigger       | What it does                                                    |
| ------------- | ----------------------------------- | ------------- | --------------------------------------------------------------- |
| **Backup Test** | `.github/workflows/backup-test.yml` | weekly cron   | Validate backup/restore scripts, dry-run restore, K8s CronJob check |

### CI/CD Pipeline Summary

| Workflow      | File                            | Trigger                | What it does                                                       |
| ------------- | ------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| **CI**        | `.github/workflows/ci.yml`      | `push`, `pull_request` | Lint → Typecheck → Test + Codecov                                  |
| **Release**   | `.github/workflows/release.yml` | tag `v*.*.*`           | Quality gate → 9 Docker images → GHCR → GitHub Release → Docs     |
| **Backup Test** | `.github/workflows/backup-test.yml` | weekly cron       | Validate backup/restore scripts                                    |

All workflows run on `ubuntu-latest` with Node.js LTS and npm cache. Failure in any workflow blocks merging.

**Concurrency:** CI grouped by workflow + ref, cancel-in-progress on new push. Release runs single pipeline (`group: pages`).

### Docker Image Tags

The release workflow generates the following tags for each image:

```yaml
tags: |
  type=semver,pattern={{version}},value=v${{ needs.quality.outputs.version }}
  type=semver,pattern={{major}}.{{minor}},value=v${{ needs.quality.outputs.version }}
  type=semver,pattern={{major}},value=v${{ needs.quality.outputs.version }}
  type=sha
```

Example for `v2.0.3`:
- `ghcr.io/trading-model/discovery-server:2.0.3`
- `ghcr.io/trading-model/discovery-server:2.0`
- `ghcr.io/trading-model/discovery-server:2`
- `ghcr.io/trading-model/discovery-server:<sha>`

### Documentation Deployment

The release workflow runs `npm run docs:generate` (TypeDoc), uploads the output as a Pages artifact, and deploys to GitHub Pages. The generated docs live at `docs/architecture/code/`.

## Related Documentation

Docker multi-stage build patterns, conventions, and per-service variations are documented in [Docker Standards](../deployment/DOCKER.md).

Deployment workflows (beta, canary, stable, rollback) are documented in [Deployment Guide](../deployment/DEPLOY.md).

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

- [PR Standards](../standards/pr-standards.md) — Required checks before merge
- [Quality Gates](../standards/quality-gates.md) — Quality thresholds
- `.github/workflows/ci.yml` — CI workflow
- `.github/workflows/release.yml` — Release workflow
- [Workflow](../contributing/workflow.md) — Full development workflow
