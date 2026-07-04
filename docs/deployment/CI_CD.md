# CI/CD — Continuous Integration and Deployment

## GitHub Actions Workflows

Three workflows automate CI/CD. Defined in `.github/workflows/`.

| Workflow    | File                            | Trigger                | What it does                                                       |
| ----------- | ------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| **CI**      | `.github/workflows/ci.yml`      | `push`, `pull_request` | Lint → Typecheck → Test + Codecov                                  |
| **Release** | `.github/workflows/release.yml` | tag `v*.*.*`           | Quality gate → 8 Docker images → GHCR → GitHub Release → Docs     |
| **Backup Test** | `.github/workflows/backup-test.yml` | weekly cron       | Validate backup/restore scripts, dry-run restore, K8s CronJob check |

---

### CI — Continuous Integration (`ci.yml`)

**Trigger:** `push` on `main`/`development`, `pull_request`

**Permissions:** `contents: read`

**Concurrency:** Grouped by workflow + ref, cancel-in-progress on new push

**Jobs (parallel):**

| Job          | Command / Action                            | Description                                     |
| ------------ | ------------------------------------------- | ----------------------------------------------- |
| `lint`       | `npm run lint`                              | Biome check across the entire monorepo          |
| `typecheck`  | `npm run build` + `tsc` on all services     | TypeScript compilation (packages + 9 services)  |
| `test`       | `npm run build` + `npm run test:coverage`   | Jest tests with coverage → Codecov upload       |

```yaml
name: CI

on:
  push:
    branches: [main, development]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

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
      - name: Build packages
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
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v5
```

The `lint`, `typecheck`, and `test` jobs run **in parallel**. All must pass to merge a PR.

---

### Release — Continuous Deployment (`release.yml`)

**Trigger:** tag `v*.*.*` (pushed to GitHub)

**Concurrency:** Single pipeline (`group: pages`)

**Jobs (sequential chain):**

```
quality ──┬── docker (9-image matrix) ──┬── release (GitHub Release)
          │                              │
          └── docs (GitHub Pages) ───────┘
```

#### 1. `quality` — Quality gate

Sequential: `npm ci` → `npm run lint` → `npm run build` → type-check all services → `npm run test:coverage` → Codecov upload → extract version from tag

#### 2. `docker` — Build and publish images

Matrix of **9 services** (requires `quality` upstream):

| Service               | Context | Dockerfile                                    |
| --------------------- | ------- | --------------------------------------------- |
| `discovery-server`    | `.`     | `services/discovery-server/Dockerfile`        |
| `message-manager`     | `.`     | `services/message-manager/Dockerfile`         |
| `financial-scraper`   | `.`     | `services/financial-scraper/Dockerfile`       |
| `trader-trainer`      | `.`     | `services/trader-trainer/Dockerfile`          |
| `certificate-authority` | `.`   | `services/certificate-authority/Dockerfile`   |
| `api-gateway`         | `.`     | `services/api-gateway/Dockerfile`             |
| `audit-logger`        | `.`     | `services/audit-logger/Dockerfile`            |
| `admin-interface`     | `.`     | `services/admin-interface/Dockerfile`         |
| `dlq-service`         | `.`     | `services/dlq-service/Dockerfile`             |

Steps:

1. Login to GitHub Container Registry (`ghcr.io`)
2. Set up Docker Buildx
3. Extract metadata (semver tags + SHA)
4. Build and push with GitHub Actions cache (`type=gha`, `mode=max`)

Tags generated:

```yaml
tags: |
  type=semver,pattern={{version}},value=v${{ needs.quality.outputs.version }}
  type=semver,pattern={{major}}.{{minor}},value=v${{ needs.quality.outputs.version }}
  type=semver,pattern={{major}},value=v${{ needs.quality.outputs.version }}
  type=sha
```

Example tags for `v2.0.3`:

- `ghcr.io/trading-model/discovery-server:2.0.3`
- `ghcr.io/trading-model/discovery-server:2.0`
- `ghcr.io/trading-model/discovery-server:2`
- `ghcr.io/trading-model/discovery-server:<sha>`

#### 3. `release` — GitHub Release

Generates release notes with `docker pull` commands for all 9 services, then creates the Release on GitHub via `softprops/action-gh-release`.

#### 4. `docs` — GitHub Pages

Runs `npm run docs:generate` (TypeDoc), uploads the output as a Pages artifact, and deploys to GitHub Pages. The generated docs live at `docs/architecture/code/`.

---

## Complete deployment flow

```
Developer pushes code
        │
        ▼
  CI (ci.yml) runs
  ┌────────────┬────────────┐
  │  lint      │  typecheck │  test
  └────────────┴────────────┘
        │
        ├── Fail → fix and push again
        │
        └── Success → PR merged into development
                          │
                          ▼
                    Beta validation (manual)
                          │
                          ▼
                    Tag v*.*.* on main
                          │
                          ▼
              ┌───────────────────────────────────┐
              │  release.yml                      │
              │  ┌─────────────────────────────┐  │
              │  │  quality                    │  │
              │  │  lint + build + typecheck   │  │
              │  │  + test + coverage          │  │
              │  └──────┬──────────────────────┘  │
              │         ▼                        │
              │  ┌─────────────────────────────┐  │
              │  │  docker (9-image matrix)    │  │
              │  │  buildx + push → ghcr.io    │  │
              │  └──────┬──────────────────────┘  │
              │         ├──────────────────────┐  │
              │         ▼                      ▼  │
              │  ┌────────────┐    ┌──────────┐   │
              │  │  release   │    │  docs    │   │
              │  │  GitHub    │    │  Pages   │   │
              │  │  Release   │    └──────────┘   │
              │  └────────────┘                   │
              └───────────────────────────────────┘
                        │
                        ▼
                  On the fleet:
            docker compose pull
            docker compose up -d
```
