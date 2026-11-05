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
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - name: Build packages (dependency order)
        run: bun run build
      - name: Type-check services
        run: |
          bun run --filter message-manager build
          bun run --filter discovery-server build
          bun run --filter financial-scraper build
          bun run --filter trader-service build
          bun run --filter api-gateway build
          bun run --filter audit-logger build
          bun run --filter dlq-service build

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: bun run test:coverage
```

> This excerpt shows the core jobs. The full `ci.yml` also defines `contract` and `e2e` jobs (see below).

**Jobs**:

- `lint` — Biome check across the entire monorepo
- `typecheck` — Build packages + type-check all services
- `test` — Build + tests with coverage, upload to Codecov
- `observability` — Observability gate (metrics, propagation, readiness)
- `k8s-overlays` — Renders the staging and production overlays (`tests/k8s/check-overlays.mjs`): every first-party image is released and rewritten by `deploy.yml`, production secrets come from SealedSecrets only
- `contract` — Contract tests between services
- `e2e` — Boot the Docker Compose stack and run E2E tests

**Permissions**: `contents: read` (read-only)

## CD: Continuous Deployment

### Workflow: `.github/workflows/release.yml`

Triggered by pushing a `vX.Y.Z` tag (`vX.Y.Z-rc.1` for a prerelease). The tag
is created locally by `bun run release:publish` (`scripts/release.mjs --publish`: version bump,
CHANGELOG, annotated tag, `git push --follow-tags`). See [release.md](../contributing/release.md).

**Jobs:**

1. `version` — checks the tag format, computes the image tag (`X.Y.Z`, no
   leading `v`) and whether this release becomes `latest`
2. `ci` — the whole CI (`ci.yml`, called as a reusable workflow) on the tagged
   commit: no image is pushed unless every gate passes
3. `build-and-push` — the 7 service images
4. `build-tools` — `spire-tools` (K8s SPIRE entry reconciler), `db-migrate` (migrations Jobs) and `backup-tools`
   (db-backup CronJob)

Actions are pinned by commit SHA (Dependabot `github-actions` keeps them up to date).

**Permissions:** `contents: read`; the two image jobs add `packages: write`.

### Docker Image Tags

Each image is pushed as `:X.Y.Z`. `:latest` moves to the release only when it is
the highest stable version among the repository tags: a backport patch
(`v1.4.2` after `v2.0.0`) or a prerelease never takes it.

Registry: repository variable `IMAGE_REGISTRY`, default `ghcr.io/<owner>` (the
only GHCR namespace `GITHUB_TOKEN` can push to). Manifests keep the logical name
`ghcr.io/trading-model/<image>`; `deploy.yml` rewrites it to the registry.

Example for `v2.0.3` (highest release), owner `docteur-turboss`:
- `ghcr.io/docteur-turboss/discovery-server:2.0.3`
- `ghcr.io/docteur-turboss/discovery-server:latest`

The cluster pulls the images itself: make the GHCR packages public, or give the
nodes pull credentials for the registry.

### Additional workflows

| Workflow      | File                                | Trigger       | What it does                                                    |
| ------------- | ----------------------------------- | ------------- | --------------------------------------------------------------- |
| **Deploy**    | `.github/workflows/deploy.yml`      | manual        | Deploy to staging/production (optional canary + smoke test + auto rollback) |
| **Backup Test** | `.github/workflows/backup-test.yml` | weekly cron   | Validate backup/restore scripts, dry-run restore, K8s CronJob check |

### CI/CD Pipeline Summary

| Workflow      | File                            | Trigger                | What it does                                                       |
| ------------- | ------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| **CI**        | `.github/workflows/ci.yml`      | `push`, `pull_request`, called by Release | Lint → Typecheck → Test + Codecov → Observability → Overlay checks → Contract → E2E (Docker) → K8s (kind) |
| **Release**   | `.github/workflows/release.yml` | `v*` tag push          | CI → 9 Docker images (`X.Y.Z`, `latest` if highest) → GHCR        |
| **Deploy**    | `.github/workflows/deploy.yml`  | manual                 | Staging/production deploy by digest (optional canary + auto rollback) |
| **Backup Test** | `.github/workflows/backup-test.yml` | weekly cron       | Validate backup/restore scripts                                    |

All workflows run on `ubuntu-latest` with Bun. Failure in any workflow blocks merging.

**Concurrency:** CI grouped by workflow + ref, cancel-in-progress on new push.

## Related Documentation

Docker multi-stage build patterns, conventions, and per-service variations are documented in [Docker Standards](../deployment/DOCKER.md).

Deployment workflows (beta, canary, stable, rollback) are documented in [Deployment Guide](../deployment/DEPLOY.md).

## Registry credentials

`release.yml` pushes with the workflow's `GITHUB_TOKEN` (`packages: write` on the
image jobs); `deploy.yml` reads the digests with it (`packages: read`). No
personal access token is needed. Set the repository variable `IMAGE_REGISTRY`
only to push somewhere else than `ghcr.io/<owner>`.

## References

- [PR Standards](../standards/pr-standards.md) — Required checks before merge
- [Quality Gates](../standards/quality-gates.md) — Quality thresholds
- `.github/workflows/ci.yml` — CI workflow
- `.github/workflows/release.yml` — Release workflow
- [Workflow](../contributing/workflow.md) — Full development workflow
