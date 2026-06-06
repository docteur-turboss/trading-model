# CI/CD — Continuous Integration and Deployment

## GitHub Actions Workflows

Two workflows automate continuous integration and deployment. They are defined in `.github/workflows/`.

| Workflow    | File                            | Trigger                | What it does                                         |
| ----------- | ------------------------------- | ---------------------- | ---------------------------------------------------- |
| **CI**      | `.github/workflows/ci.yml`      | `push`, `pull_request` | Lint → Build → Test                                  |
| **Release** | `.github/workflows/release.yml` | tag `v*.*.*`           | Quality gate → Docker images → GHCR → GitHub Release |

---

### CI — Continuous Integration (`ci.yml`)

**Trigger:** `push` on any branch, `pull_request`

**Permissions:** `contents: read`

**Jobs:**

| Job    | Command                                                   | Description                                       |
| ------ | --------------------------------------------------------- | ------------------------------------------------- |
| `lint` | `npm run lint`                                            | ESLint check across the entire monorepo           |
| `test` | `npm run build --if-present` then `npm run test:coverage` | TypeScript compilation + Jest tests with coverage |

Workflow excerpt:

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

The `lint` and `test` jobs run **in parallel**. The commit must be green to merge a PR.

---

### Release — Continuous Deployment (`release.yml`)

**Trigger:** tag `v*.*.*` (pushed to GitHub)

**Jobs:**

#### 1. `quality` — Quality gate

Same steps as CI, but executed sequentially:

```yaml
- run: npm ci
- run: npm run lint
- run: npm run build
- run: npm run test:coverage
```

Extracts the version from the Git tag:

```yaml
- name: Extract version from tag
  id: version
  run: echo "version=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"
```

#### 2. `docker` — Build and publish images

Matrix of 4 services (requires `quality` upstream):

| Service             | Context | Dockerfile                              |
| ------------------- | ------- | --------------------------------------- |
| `discovery-server`  | `.`     | `services/discovery-server/Dockerfile`  |
| `message-manager`   | `.`     | `services/message-manager/Dockerfile`   |
| `financial-scraper` | `.`     | `services/financial-scraper/Dockerfile` |
| `trader-trainer`    | `.`     | `services/trader-trainer/Dockerfile`    |

Steps:

1. Login to GitHub Container Registry (`ghcr.io`)
2. Setup Docker Buildx
3. Extract metadata (semver tags + SHA)
4. Build and push with GitHub Actions cache

Tags generated:

```yaml
tags: |
  type=semver,pattern={{version}}
  type=semver,pattern={{major}}.{{minor}}
  type=semver,pattern={{major}}
  type=sha
```

Example tags for `v1.2.3`:

- `ghcr.io/<owner>/trading-model/discovery-server:1.2.3`
- `ghcr.io/<owner>/trading-model/discovery-server:1.2`
- `ghcr.io/<owner>/trading-model/discovery-server:1`
- `ghcr.io/<owner>/trading-model/discovery-server:<sha>`

#### 3. `release` — GitHub Release

Generates release notes with `docker pull` commands for each service, then creates the Release on GitHub via `softprops/action-gh-release`.

---

## Complete deployment flow

```
Developer pushes code
        │
        ▼
  CI (ci.yml) runs
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
              ┌─────────────────────┐
              │  release.yml        │
              │  ┌───────────────┐  │
              │  │  quality      │  │
              │  │  lint+build   │  │
              │  │  +test        │  │
              │  └──────┬────────┘  │
              │         ▼          │
              │  ┌───────────────┐  │
              │  │  docker       │  │
              │  │  buildx + push│  │
              │  │  → ghcr.io    │  │
              │  └──────┬────────┘  │
              │         ▼          │
              │  ┌───────────────┐  │
              │  │  release      │  │
              │  │  GitHub       │  │
              │  │  Release      │  │
              │  └───────────────┘  │
              └─────────────────────┘
                        │
                        ▼
                  On the fleet:
            docker compose pull
            docker compose up -d
```
