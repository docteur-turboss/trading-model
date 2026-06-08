# Contribute — Full Workflow from Idea to Production

> **Quick start:** See [CONTRIBUTING.md](../../CONTRIBUTING.md) for a concise overview before diving into the full workflow.

## Branch Strategy

```
main ────────╂──────────────────╂──── (production, protected)
              ╲                ╱
development ───╂──────────────╂─── (integration, protected)
                │  ┌──────┐  │
                ├──│feature│──┤
                ├──│  fix  │──┤
                ├──│refact │──┤
                └──│ docs  │──┘
                       │
main ──────────────────╂─── (hotfix)
               ┌───────┘
               │ hotfix/
```

| Branch        | Base          | Usage                                       |
| ------------- | ------------- | ------------------------------------------- |
| `main`        | —             | Production only. Protected — no direct push |
| `development` | —             | Integration. Protected — PR required        |
| `feature/*`   | `development` | New functionality                           |
| `fix/*`       | `development` | Bug fix                                     |
| `refactor/*`  | `development` | Refactoring                                 |
| `docs/*`      | `development` | Documentation                               |
| `release/*`   | `main`        | Urgent hotfix (direct merge to `main`)      |

---

## Code Organization

The project is an npm workspaces monorepo:

```
trading-model/
├── packages/     # Shared libraries (@trading-model/*)
│   └── lib/      # Common utilities, types, middleware
├── services/     # Microservices (kebab-case directory names)
│   └── <service>/
│       ├── src/
│       │   ├── app/           # Entry points & routes
│       │   ├── config/        # Environment & app config
│       │   ├── core/          # Business logic (services, repositories)
│       │   ├── controllers/   # HTTP controllers
│       │   ├── middleware/    # Express middleware
│       │   └── types/         # Type definitions
│       ├── tests/
│       │   ├── unit/
│       │   ├── integration/
│       │   └── e2e/
│       └── docs/
├── docs/         # Centralized documentation
└── scripts/      # Automation scripts
```

## Naming Conventions

| Element               | Convention           | Example                |
| --------------------- | -------------------- | ---------------------- |
| Directories           | kebab-case           | `discovery-server/`    |
| Files                 | kebab-case           | `address-manager.ts`   |
| Classes & Types       | PascalCase           | `class AddressManager` |
| Variables & Functions | camelCase            | `const addressManager` |
| Constants             | SCREAMING_SNAKE_CASE | `DEFAULT_TIMEOUT`      |
| Test files            | `.spec.ts` only      | `user.service.spec.ts` |

File suffixes: `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.middleware.ts`, `*.util.ts`, `*.spec.ts`

## Code Style

- **Formatter**: Prettier with `printWidth: 100`, `singleQuote`, `trailingComma: "es5"`, `arrowParens: "avoid"`
- **Linter**: ESLint with TypeScript strict rules
- **TypeScript**: `strict: true`, target ES2020

### Import Order

1. Node built-ins (`fs`, `path`)
2. External deps (`express`, `zod`)
3. Internal absolute (`@trading-model/*`)
4. Internal relative (`../controllers/`)
5. Side effects (`import './setup'`)

## Testing

- **Framework**: Jest with `ts-jest`
- **Convention**: Single `.spec.ts` suffix
- **Coverage thresholds**: per-module (common/discovery 100%, address-manager/broker-message/trader-trainer 80% minimum)
- **Structure**: Tests mirror source under `tests/unit/`, `tests/integration/`, `tests/e2e/`

---

## Full Cycle

### 1. Idea

Create a **GitHub Issue** with the appropriate template:

- **Bug**: describe expected vs. observed behavior, logs, environment
- **Feature**: describe the need, use case, acceptance criteria

### 2. Branch

```bash
git checkout development && git pull
git checkout -b feature/my-feature
```

### 3. Local development

```bash
npm ci            # clean install from lockfile
npm run build     # compile shared packages
```

Refer to code standards in `docs/standards/`.

### 4. Local validation

```bash
npm run lint       # ESLint
npm run build      # TypeScript
npm test           # Jest — minimum 80% coverage
```

### 5. Commit

```bash
npm run commit     # interactive gitmoji tool
```

Conventional format:

```
:sparkles:(scraper): add new exchange client
:bug:(broker): fix race condition on unsubscribe
:memo:(docs): update API reference
```

Types: `sparkles` (feat), `bug` (fix), `memo` (docs), `recycle` (refactor), `zap` (perf), `white_check_mark` (test), `wrench` (chore), `construction_worker` (ci), `lock` (security), `boom` (breaking).

See `docs/standards/COMMIT.md` for the full list of types.

### 6. Push

```bash
git push -u origin feature/my-feature
```

CI runs automatically on the branch.

### 7. Pull Request

Create a PR on GitHub targeting **`development`**.

See `docs/standards/PR.md` for the template and guidelines.

### 8. Review

- All CI checks must be green
- At least **1 approval** required
- All comments must be resolved before merging

### 9. Merge

**Squash & Merge** into `development`. Delete the branch after merging.

### 10. Release

```bash
git checkout main && git pull
git merge development
npm run release                  # bump version, CHANGELOG
git add -A
git commit -m ":bookmark:(release): v$(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push --follow-tags           # triggers release.yml
```

This triggers:

1. Quality gate (lint + build + test)
2. Build Docker images for all 4 services
3. Push to **GitHub Container Registry** (`ghcr.io/trading-model/<service>`)
4. Create a **GitHub Release** with changelog + pull commands

### 11. Deploy (Production)

On the production server:

```bash
git pull --tags
git checkout v$(node -p "require('./package.json').version")
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose pull
IMAGE_TAG=$(node -p "require('./package.json').version") docker compose up -d
```

---

## Workflow at a Glance

```
dev  ──→ commit ──→ push ──→ PR ──→ merge ──→ beta deploy
        npm run     git push  (auto      dev    docker compose
        commit                 lint               pull + up -d
                               build
                               test)         (validate)

main ←── merge dev ────→ tag ──→ stable deploy
              (if OK)     npm run   docker compose
                          release   pull + up -d
```

---

## Roles

### New contributor

1. Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for a quick overview
2. Set up the machine (see [SETUP.md](SETUP.md))
3. Create an Issue or pick an existing one
4. Create a branch and submit your first PR
5. Request a review from a maintainer

### General developer / Maintainer

Full cycle steps 4–11:

- Validate locally (lint, build, test)
- Commit with `npm run commit`
- Push and create the PR
- Review others' PRs
- Merge into `development`
- Prepare and push the release tag

---

## Command summary

```bash
# Dev
git checkout development && git pull
git checkout -b feature/my-feature
npm ci && npm run build && npm test
# ... code ...
npm run commit
git push -u origin feature/my-feature

# Release (maintainer)
git checkout main && git pull
git merge development
npm run release
git add -A && git commit -m ":bookmark:(release): v$(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push --follow-tags
```
