# Development → Production Workflow

This page covers the full lifecycle: how code goes from an idea to running in
production.  
Designed so you type as few commands as possible — each phase is a single step.

---

## At a Glance

```
dev  ──→ commit ──→ push ──→ PR ──→ merge ──→ beta deploy
        npm run     git push  (auto      dev    docker compose
        commit                 lint               pull + up -d
                               build
                               test)         (few days, validate)

main ←── merge dev ──→ tag ──→ stable deploy
              (if OK)   npm run   docker compose
                        release   pull + up -d
```

---

## Quick reference — all commands for a full cycle

```bash
# ── Dev ──────────────────────────────────────────────────
git checkout dev && git pull
git checkout -b feat/my-thing
npm ci && npm run build && npm test   # one-time setup
# ... code ...
npm run commit                        # interactive conventional commit
git push -u origin feat/my-thing      # push → CI runs, open PR

# ── Maintainer ────────────────────────────────────────────
# Merge PR on GitHub into dev, validate beta, then:
git checkout main && git pull
git merge dev                         # merge beta-validated changes
npm run release                       # bumps version, updates CHANGELOG.md
git add -A && git commit -m ":bookmark:(release): v$(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push --follow-tags                # CI builds Docker images → GHCR

# ── Ops ───────────────────────────────────────────────────
# On the production server (one-time: git clone, npm ci, build, TLS certs):
git pull --tags
git checkout v$(node -p "require('./package.json').version")
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose pull
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose up -d
```

---

## Detail — phase by phase

### 1. Develop

```bash
git checkout dev && git pull
git checkout -b feat/my-thing
npm ci               # clean install (uses lockfile)
npm run build        # compile shared packages
```

> **Hotfix :** pour les correctifs urgents en production, partir de `main` et merger directement sur `main` (hotfix/xxx).

The project is an **npm workspaces** monorepo. Shared packages live in
`packages/` and are compiled before services. See `package.json` scripts.

### 2. Commit

```bash
npm test                # Jest with 80 % minimum coverage
npm run commit          # interactive gitmoji picker
```

Commit format (enforced by husky + commitlint):

```
:sparkles:(scraper): add new exchange client
:bug:(broker): fix race condition on unsubscribe
:memo:(docs): update API reference
```

Avaiable types: `sparkles` (feat), `bug` (fix), `memo` (docs),
`recycle` (refactor), `zap` (perf), `white_check_mark` (test),
`wrench` (chore), `construction_worker` (ci), `lock` (security), `boom` (breaking).

### 3. Push & PR

```bash
git push -u origin feat/my-thing
```

Open a Pull Request on GitHub targeting **`dev`**. CI runs **automatically** (see pipelines below).
PR must be **approved** and all checks **green** before merging.

Use **Squash & Merge** to merge into `dev`, then delete the branch.

### 4. Beta (dev)

After merging into `dev`, the branch is automatically deployed as a **beta** version.

- If everything runs smoothly and no critical errors are reported → proceed to step 5 after a **few days** of validation.
- If too many errors or regressions are found → **redeploy `main`** as the beta version instead, and fix the issues on a new feature branch.

```bash
# On the beta server
git checkout dev && git pull
IMAGE_TAG=latest docker compose pull
IMAGE_TAG=latest docker compose up -d
```

### 5. Release

Only maintainers. Once the beta is validated, merge `dev` into `main`, then from an up-to-date `main` branch:

```bash
npm run release              # bumps root + packages, writes CHANGELOG.md
git add -A
git commit -m ":bookmark:(release): v$(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push --follow-tags
```

This triggers the **release.yml** workflow on GitHub Actions which:

1. Quality gate (lint + build + test)
2. Build Docker images for all 4 services (with GitHub Actions cache)
3. Push to **GitHub Container Registry** (`ghcr.io/<owner>/trading-model/<service>`)
4. Create a **GitHub Release** with changelog + pull commands

### 6. Deploy (stable)

On the production server (requires Docker + Docker Compose and OpenSSL):

```bash
git pull --tags
git checkout v$(node -p "require('./package.json').version")
cp .env.example .env                        # edit ports, passwords
mkdir -p certs && openssl req ...           # see QUICKSTART.md step 4
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose pull
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose up -d
```

> `IMAGE_TAG` controls which image version to pull. Set `IMAGE_TAG=latest` in
> `.env` to always track the latest release, or pin to a specific version.

### 7. Verify

```bash
docker compose ps                    # all containers Up / healthy
curl -k https://localhost:8443/ping  # discovery server responds
docker compose logs -f               # tail all logs
```

---

## CI/CD pipelines

| Workflow    | File                            | Trigger                | What it does                                         |
| ----------- | ------------------------------- | ---------------------- | ---------------------------------------------------- |
| **Lint**    | `.github/workflows/lint.yml`    | `push`, `pull_request` | ESLint across `.ts`, `.js`, `.mjs`, `.cjs`           |
| **Build**   | `.github/workflows/build.yml`   | `push`, `pull_request` | `npm run build` (compiles 3 shared packages)         |
| **Test**    | `.github/workflows/test.yml`    | `push`, `pull_request` | Jest with coverage threshold                         |
| **Release** | `.github/workflows/release.yml` | tag `v*.*.*`           | Quality gate → Docker images → GHCR → GitHub Release |

All non-release workflows run in parallel on `ubuntu-latest` with Node.js LTS
and npm cache. Failure in any workflow blocks merging.

> There is no automatic deploy to a live environment yet. Deployment is a
> manual `docker compose pull && docker compose up -d` (step 6 above).

---

## Database migrations

- **MySQL**: Schema is in `scripts/init-db.sql`. Tables are auto-created on
  first Docker start via `/docker-entrypoint-initdb.d/` mount.
- **MongoDB**: No schema persistence yet — broker works in-memory.
- For schema changes, add `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` to
  `scripts/init-db.sql`.
- ⚠️ No automated migration runner exists yet. Destructive changes may require
  manual SQL.

---

## Secrets and security

| Secret                    | Where to set                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| `MYSQL_ROOT_PASSWORD`     | `.env` on the server                                             |
| TLS certs (`certs/*.pem`) | Generated once with OpenSSL (see QUICKSTART.md), never committed |
| `ERROR_URL_WEBHOOK`       | `.env` (optional error notification endpoint)                    |
| `GITHUB_TOKEN`            | Auto-available in GitHub Actions                                 |

Never commit `.env` or `certs/` to version control.
