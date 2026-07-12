# Commit Standards

## Why

Standardized commit messages enable automatic changelog generation, release notes, and traceability of changes. Each commit must be understandable without additional context.

## Format

```
<gitmoji>(<scope>): <subject>

<body>

<footer>
```

The gitmoji emoji is mandatory, the scope is optional but encouraged.

### Breaking Changes

Add `!` after the scope to signal a breaking change:

```
<gitmoji>(<scope>)!: <subject>
```

Examples:

```
:recycle:(common)!: rename ServiceInstance to RegisteredInstance
```

## Gitmoji Reference

| Emoji | Code                    | Type     | Description                   |
| ----- | ----------------------- | -------- | ----------------------------- |
| ✨    | `:sparkles:`            | feat     | New feature                   |
| 🐛    | `:bug:`                 | fix      | Bug fix                       |
| 📝    | `:memo:`                | docs     | Documentation                 |
| 💄    | `:lipstick:`            | style    | Formatting (Biome) |
| ♻️    | `:recycle:`             | refactor | Code restructuring            |
| ⚡    | `:zap:`                 | perf     | Performance improvement       |
| ✅    | `:white_check_mark:`    | test     | Test additions/modifications  |
| 🔧    | `:wrench:`              | chore    | Configuration, tooling        |
| 👷    | `:construction_worker:` | ci       | CI/CD changes                 |
| 🔒    | `:lock:`                | security | Security fix                  |
| 🚀    | `:rocket:`              | release  | Release / version bump        |
| 💥    | `:boom:`                | breaking | Breaking change               |

For the full list including variants (🏷️ feat-types, 🎉 feat-init, 🚑 fix-hotfix, ✏️ fix-typo, 🔥 fix-remove, 📚 docs-api, 👕 style-lint, 🗑️ refactor-depr, 💥 test-breaking, 📌 chore-pin, ⬆️ chore-up, ⬇️ chore-down, 💚 ci-fix, 🛡️ security-audit), see `scripts/commit.mjs`.

## Scopes

| Scope               | Context                                |
| ------------------- | -------------------------------------- |
| `auth`              | Authentication and authorization       |
| `scraper`           | Financial-scraper service              |
| `api`               | API endpoints                          |
| `wallet`            | Wallet management                      |
| `core`              | Core business logic                    |
| `deps`              | Dependencies                           |
| `discovery`         | Discovery-server service               |
| `broker`            | Broker-message package                 |
| `trainer`           | Trader-trainer service                 |
| `router`            | Express routing                        |
| `common`            | @trading-model/common package          |
| `config`            | Configuration                          |
| `database`          | Database                               |
| `middleware`        | Express middleware                     |
| `utils`             | Utilities                              |
| `types`             | TypeScript types                       |
| `address-manager`   | @trading-model/address-manager package |
| `message-manager`   | Message-manager service                |
| `financial-scraper` | Financial-scraper service              |
| `trader-trainer`    | Trader-trainer service                 |
| `discovery-server`  | Discovery-server service               |
| `docs`              | Documentation                          |
| `github-actions`    | GitHub Actions workflows               |
| `husky`             | Husky configuration                    |
| `biome`             | Biome configuration                    |
| `audit-logger`      | Audit-logger service                   |
| `dlq-service`       | DLQ service                            |
| `api-gateway`       | API gateway service                    |
| `certificate-authority` | Certificate authority service      |
| `admin-interface`   | Admin interface SPA                    |
| `certificate-utils` | @trading-model/certificate-utils package |
| `certificate-client` | @trading-model/certificate-client package |

## Body and Footer (Optional)

- **Body**: Multi-line text explaining the _why_ and _how_ of the change
- **Footer**: References to issues, tickets, or breaking changes

## Recommended Tool: `npm run commit`

Launches the interactive commit creation interface:

```bash
npm run commit
```

This command runs `scripts/commit.mjs` which provides a console UI for:

1. Choosing a category (Features, Fixes, Documentation, Style, Refactor, Performance, Tests, Chore, CI, Security)
2. Choosing a specific gitmoji emoji
3. Choosing a scope (or none)
4. Entering the subject (required)
5. Confirming a breaking change
6. Adding a body (optional, blank line to finish)
7. Adding a footer (optional)
8. Confirming and executing `git commit`

## Automatic Validation (commitlint + Husky)

A `commit-msg` Husky hook validates the commit message via commitlint. The configuration expects the gitmoji format.

Configured Husky hooks:

- **pre-commit**: biome (lint-staged)
- **commit-msg**: message validation via commitlint
- **pre-push**: tests + build

## Workflow Integration

```
dev  ──→ commit ──→ push ──→ PR ──→ merge ──→ beta deploy
        npm run     git push  (auto      dev
        commit                 lint
                               build
                               test)

main ←── merge dev ────→ tag ──→ stable deploy
              (if OK)     npm run
                          release
```

Commands for a full cycle:

```bash
# ── Dev ──────────────────────────────────────────────────
git checkout development && git pull
git checkout -b feat/my-thing
npm ci && npm run build && npm test
# ... code ...
npm run commit                        # interactive conventional commit
git push -u origin feat/my-thing      # push → CI runs, open PR

# ── Maintainer ────────────────────────────────────────────
# Merge PR on GitHub into development, validate beta, then:
git checkout main && git pull
git merge development
npm run release                       # bumps version, updates CHANGELOG.md
git add -A && git commit -m ":rocket:(release): v$(node -p "require('./package.json').version")"
git tag v$(node -p "require('./package.json').version")
git push --follow-tags                # CI builds Docker images → GHCR
```

## Examples

### Good Commits

```
:sparkles:(auth): add JWT validation for protected endpoints
```

```
:bug:(scraper): handle missing fields in API responses

The Binance API may omit certain fields for inactive
pairs. Added Zod validation with default values.

Fixes #142
```

```
:recycle:(common): centralize ServiceInstance type

Extract ServiceInstance type to @trading-model/common/contracts
to avoid duplication between discovery-server and message-manager.
```

```
:memo:(api): document discovery registration endpoints
```

```
:white_check_mark:(address-manager): add tests for address validation

- Unit tests for AddressValidator
- Integration tests for address cache
- Coverage at 100% on the module
```

```
:lock:(middleware): validate HMAC token before each request
```

```
:construction_worker:(github-actions): add Docker release workflow
```

```
:arrow_up:(deps): update TypeScript to 6.0
```

### Bad Commits

```
fix bug
// No emoji, no scope, vague subject
```

```
WIP
// No information
```

```
:sparkles:(common)(address-manager)(broker-message): lots of changes everywhere
// Too many scopes — separate commits
```

```
feat: added new feature and also fixed some bugs and updated docs
// Mixed types — one commit = one thing
```

## References

- `scripts/commit.mjs` — Interactive commit creation script
- `.husky/` — Husky hooks configuration
- [PR Standards](./pr-standards.md) — Pull request standards
- [Workflow](../contributing/workflow.md) — Full development workflow
