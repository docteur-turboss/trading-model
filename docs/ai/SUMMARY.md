# Trading Model — AI Summary

## 1. Identity

- **name:** trading-model (v2.0.3)
- **license:** PolyForm Noncommercial 1.0.0
- **type:** monorepo (npm workspaces: 3 packages, 4 services)
- **lang:** TypeScript 6 (strict, ES2020, module node16)
- **runtime:** Node.js 20+, Alpine in Docker
- **format:** Prettier (semi, singleQuote, printWidth 100, arrowParens avoid, trailingComma es5, tabWidth 2, LF)
- **lint:** ESLint 10 flat config (tseslint recommended, ignores dist/spec/jest/fixtures/helpers/typedoc)
- **hooks:** Husky — pre-commit (lint-staged: prettier+eslint), commit-msg (commitlint), pre-push (build+test:coverage)
- **code-quality audit:** 19 findings resolved across all packages/services — rate limiting, secret redaction, HTTP timeouts, payload validation, DI decoupling, GA refactoring, error normalization, type safety, discriminated unions, TLS dedup, CI/CD enhancement, naming consistency, log formatting, redundant comments, private encapsulation

## 2. Structure

```
trading-model/
├── packages/           # @trading-model/common, address-manager, broker-message
├── services/           # discovery-server, message-manager, financial-scraper, trader-trainer
├── docs/               # standards/, deployment/, architecture/api/, architecture/code/, ai/
├── scripts/            # commit.mjs, release.mjs, generate-docs.mjs, deploy-*.ps1/sh, generate-certs.sh, hosts.json, init-db.sql
├── .github/workflows/  # ci.yml, release.yml
├── certs/              # TLS (gitignored)
├── .husky/
├── docker-compose.yml  # 6 services (mongo, mysql + 4 app)
└── eslint.config.mjs, .prettierrc, commitlint.config.mjs
```

## 3. Packages

### @trading-model/common

- **exports:** sub-path via `exports` map: `./config/*`, `./middleware/*`, `./utils/*`, `./server/*`, `./validation/*`, `./contracts/*`, `./crypto/*`
- **key:** Logger, createBootstrap(), createSecureServer(), HttpClient, BaseEnvSchema, AddressManagerEnvSchema, catchSync/ResponseException/HTTP_CODE, EventMap (8 keys), EnumEventMessage, ServiceInstanceName, DeliveryMode, sleep(), prng, sanitizePayload(), normalizeError(), sanitizeForLog(), HttpClient.createWithTls()
- **deps:** express 5, helmet, zod 4, express-rate-limit, chained-error
- **coverage threshold:** 100%
- **notable:** 7 `*Entity` types renamed to `*Data`; discriminated union types for `Experience` and `StopCondition`; `safeStringify` extends secret redaction patterns (TLS/PEM, DB, JWT); `DEFAULT_TIMEOUT_MS=5000` always-on HTTP timeout; NoSQL injection prevention with max nesting depth 10

### @trading-model/address-manager

- **class `AddressManager(config)`:** start()→{stop}, findService(name), getToken(), listenExpress(app)
- **factory:** createAddressManager(env)
- **internal:** ServiceDiscovery, TokenManager, ServiceCache, ServiceHealthChecker, ServiceLocator, RefreshJob, Scheduler
- **deps:** common, express 5, node-cron
- **coverage threshold:** 80%

### @trading-model/broker-message

- **class `MessageManagerClient(config)`:** intents(topics), stopMessageManager(), on(event,listener), listenExpress(app), post.direct(service,payload,metadata), post.indirect(payload,metadata)
- **helpers:** MessageMetadata (MetadataBuilder), MessageMetadataSchema/PayloadSchema (Zod)
- **deps:** common, address-manager, express 5, zod 4
- **coverage threshold:** 80%

## 4. Services

| Service           | Host:Port | Name                      | Key                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | --------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| discovery-server  | 8443      | discovery-service         | POST /register (HMAC token), /heartbeat, /token/rotate, GET /services, /services/:name, /services/:name/:id — in-memory TTL registry; structured logging for cleanup lifecycle; normalized error handling                                                                                                                                                        |
| message-manager   | 8444      | message-delivery-service  | POST /message (1000/min rate-limit), /subscription (500/min), DELETE /subscription (500/min) — MongoDB 7, DLQ, Zod validation middleware (`validateSchema`), 3 delivery modes, `MessageDeliveryPort` interface decouples dispatcher from HttpClient/DqlRepository, `withTimeout` middleware (30s publish, 10s subscribe), payload sanitization (NoSQL injection) |
| financial-scraper | 8445      | financial-scraper-service | Binance REST → MySQL 8 (market_candles, trades, tickers) — node-cron per symbol, p-limit, token-bucket rate limiter, structured log messages                                                                                                                                                                                                                     |
| trader-trainer    | 8446      | trader-training-service   | Custom GA + NN (TS impl), subscribes to 6 market events, trains every 60s per symbol; `ApplicationContainer` DI replaces module-level singletons; consolidated NSGA-II (nsga2.ts re-exports from pareto-engine); `Trainer.train()` refactored (63→24 lines); LRU memory limits on MarketDataBuffer; structured training lifecycle logs                           |

All use mTLS, HMAC-SHA256 token auth, Zod env validation (fail-fast at startup).

## 5. Dependency Graph & Ports

```
common ← address-manager ← broker-message ← financial-scraper
common ← discovery-server                  ← trader-trainer
                                           ← message-manager
```

| Service           | Host | Container |
| ----------------- | ---- | --------- |
| discovery-server  | 8443 | 3000      |
| message-manager   | 8444 | 3000      |
| financial-scraper | 8445 | 3000      |
| trader-trainer    | 8446 | 3000      |

TLS certs: `/certs:ro` (from TLS_CERTS_DIR env, default ./certs)

## 6. Databases

- **MongoDB 7** — message-manager (connection: mongodb://mongo:27017/message-manager), persistence planned
- **MySQL 8** — financial-scraper, DB `financial_scraper`, 3 tables with composite PKs:

| Table          | PK                                                 | Key columns                                                                                        |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| market_candles | (id,symbol,market,interval_value,timestamp,source) | open/high/low/close DECIMAL(20,10), volume DECIMAL(30,10), trades INT, close_timestamp DATETIME(3) |
| market_trades  | (symbol,market,source,trade_id,timestamp)          | price DECIMAL(20,10), quantity DECIMAL(30,10), side ENUM(buy,sell)                                 |
| market_tickers | (id,symbol,market,timestamp,source)                | open/high/low/last/volume, close_time DATETIME(3)                                                  |

Indexes: invisible on timestamp, visible on symbol. ORM: ts-sql-query via mysql2.

## 7. Docker

- **Multi-stage build:** deps (prod deps) → build (dev + tsc) → runtime (minimal)
- **Base image:** `node:20-alpine` with tini init (`/sbin/tini --`)
- **Registry:** `ghcr.io/<repo>/<service-name>`
- **Context:** root of monorepo (`.`)
- **Healthchecks:** curl over HTTPS with client certs
- **compose volumes:** mongo-data, mysql-data

## 8. CI/CD

### CI (ci.yml)

- **trigger:** push, pull_request
- **jobs:** 3 parallel: lint (npm ci → lint), typecheck (npm ci → build → tsc --noEmit), test (npm ci → build → test:coverage)
- **concurrency:** cancel-in-progress on same ref (group: `ci-${{ github.ref }}`)
- **permissions:** contents: read
- **Codecov:** upload v5 for coverage reporting

### CD Release (release.yml)

- **trigger:** tag `v*.*.*`
- **jobs (sequential):** quality (lint+typecheck+build+test:coverage+codecov) → docker (buildx+push 4 images to GHCR, semver+sha tags) → release (GitHub Release)
- **permissions:** quality=read, docker=read+packages:write, release=contents:write
- **secret:** GHCR_TOKEN (classic PAT with write:packages scope)

## 9. Commit Convention

- **format:** `:emoji:(scope): subject` (e.g. `:recycle:(common): centralize ServiceInstance type`)
- **breaking:** add `!` after scope: `:emoji:(scope)!: subject`
- **enforced:** commitlint + Husky commit-msg hook
- **tool:** `npm run commit` (scripts/commit.mjs — interactive)
- **scopes:** auth, scraper, api, wallet, core, deps, discovery, broker, trainer, router, common, config, database, middleware, utils, types, address-manager, message-manager, financial-scraper, trader-trainer, discovery-server, docs, github-actions, husky, eslint
- **gitmoji map:** sparkles=feat, bug=fix, memo=docs, recycle=refactor, zap=perf, white_check_mark=test, wrench=chore, construction_worker=ci, lock=security, rocket=release, boom=breaking (+ variants in scripts/release.mjs)
- **body:** multi-line explaining why/how (optional)
- **footer:** references to issues (optional)

## 10. Pull Request Standards

- **target:** feature→development, release→main, hotfix→main+cherry-pick dev
- **branch naming:** `feature/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*`
- **required CI:** lint, build, test:coverage (all must pass)
- **review:** >= 1 approval, squash & merge into development
- **labels:** enhancement, bug, documentation, refactor, dependencies
- **template:** .github/PULL_REQUEST_TEMPLATE.md (description, type, changes, breaking, tests, checklist)

## 11. Code Quality Audit

A comprehensive audit resolved 19 findings across the monorepo:

| #   | Finding               | Resolution                                                                                    |
| --- | --------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Rate limiting         | `express-rate-limit` on message-manager POST routes (1000/min publish, 500/min subscription)  |
| 2   | Secret handling       | Extended `safeStringify` patterns; `sanitizeForLog()` for PEM redaction; `readTlsFile` helper |
| 3   | HTTP timeouts         | `DEFAULT_TIMEOUT_MS=5000` always-on in `HttpClient.request()`                                 |
| 4   | Payload validation    | `validateSchema` middleware factory (Zod→Express); `sanitizePayload` blocks MongoDB operators |
| 5   | DI decoupling         | `MessageDeliveryPort` interface; `ApplicationContainer` DI class for trader-trainer           |
| 6   | GA complexity         | Consolidated nsga2.ts→pareto-engine.ts (-124 lines); extracted `evaluateSingleGenomeOnWindow` |
| 7   | Error normalization   | `normalizeError(err)` utility applied to 18 catch blocks across 13 files                      |
| 8   | CI/CD                 | Parallel jobs (lint/typecheck/test) with concurrency cancel-in-progress; Codecov v5           |
| 9   | Type safety           | Replaced `as unknown as` double casts with proper typed casts; narrowed `tokenHeader`         |
| 10  | Discriminated unions  | `StopCondition` union; `Experience` by `kind` (Bare/QLearning/Supervised)                     |
| 11  | TLS duplication       | `HttpClient.createWithTls(certPaths)` static factory + `TlsClientPaths` interface             |
| 12  | Long functions        | `Trainer.train()` 63→24 lines by extracting `validateTrainingPrerequisites`, `createRunner`   |
| 13  | Magic numbers/strings | `DEFAULT_VALIDATION_SPLIT`, `MIN_CANDLE_RATIO` constants; replaced template-literal logs      |
| 14  | Unstructured logging  | 18 log lines in 8 files: static message + structured context object; removed `LOG_PREFIX`     |
| 15  | Naming inconsistency  | `*Entity` → `*Data` (6 types); `moduleNameMapper` in jest configs                             |
| 16  | Redundant comments    | 48 JSDoc comments removed (Returns/Checks/Sets patterns); kept `@param` docs                  |
| 17  | Public properties     | `Agent.nn`, `TradingAgent.agent`, `StateManager.gamma` → private; forwarding methods added    |

### Quality Gates

- **ESLint:** 0 errors in CI (warnings tolerated short-term)
- **Pre-commit:** lint-staged (prettier --check + eslint on staged)
- **Pre-push:** npm run build + npm test
- **CI:** lint → typecheck → test:coverage
- **Deps:** npm audit + Dependabot (automatic PRs, merge quickly)

## 12. Code Standards

### Naming

| Element                        | Convention      | Example                                   |
| ------------------------------ | --------------- | ----------------------------------------- |
| vars/fns                       | camelCase       | `const addressManager`, `validateToken()` |
| booleans                       | camelCase       | `isTokenExpired`                          |
| classes/interfaces/types/enums | PascalCase      | `AddressManager`, `ServiceRegistry`       |
| files/dirs                     | kebab-case      | `address-manager.service.ts`              |
| constants                      | SCREAMING_SNAKE | `DEFAULT_TIMEOUT = 30000`                 |

### JSDoc

- 3rd person singular: Returns, Parses, Validates
- No @param/@returns type (TypeScript provides it)
- Dash separator: `@param name - Description`
- @throws only for non-obvious cases
- One-liner if description fits
- No @typedef, no @example unless truly non-obvious

### Import order

1. Node builtins → 2. External → 3. Workspace (@trading-model/\*) → 4. Relative → 5. Side effects

### TypeScript strict

- strict: true, noImplicitAny, strictNullChecks, ES2020, module node16, no path aliases

## 13. Testing

- **framework:** Jest 30 + ts-jest 29
- **structure:** `tests/{unit,integration,e2e,fixtures,helpers}/`
- **naming:** `*.spec.ts` (preferred), `*.test.ts` (legacy transition)
- **pattern:** AAA (Arrange-Act-Assert)
- **mocks:** `__mocks__/` next to mocked module

### Coverage thresholds

| Module            | Branches | Functions | Lines   | Statements |
| ----------------- | -------- | --------- | ------- | ---------- |
| common            | 100%     | 100%      | 100%    | 100%       |
| address-manager   | 80%      | 80%       | 80%     | 80%        |
| broker-message    | 80%      | 80%       | 80%     | 80%        |
| discovery-server  | 100%     | 100%      | 100%    | 100%       |
| message-manager   | 100%     | 100%      | 100%    | 100%       |
| financial-scraper | 100%     | 100%      | 100%    | 100%       |
| trader-trainer    | not set  | not set   | not set | not set    |

## 14. Verification Protocol

### Before commit

1. `git diff --cached` — review staged changes
2. Grep for secrets (tokens, passwords, keys)
3. Commit msg follows gitmoji format
4. No debug/commented code (console.log, debugger, TODO, FIXME)
5. Pre-commit hooks pass (prettier, eslint, commitlint)

### Before PR

1. Branch up to date with base
2. lint (0 errors) + build + test:coverage pass
3. New code covered (≥80%)
4. PR description follows template
5. No breaking changes without migration path
6. Labels set, target branch correct

### During PR review

1. CI checks pass (automated)
2. Code conventions, naming, structure (reviewer)
3. Coverage adequate, no regressions (reviewer)
4. ≥1 approval, all comments resolved

### Before release

1. development branch CI green
2. All PRs merged into development
3. main up to date locally
4. Dependabot PRs merged
5. CHANGELOG reflects changes
6. Bump type correct (--bump major/minor/patch or --version x.y.z)
7. GHCR_TOKEN secret configured

### During release

1. `git checkout main`
2. `git merge development`
3. `npm run release` (bump + changelog) or `npm run release:publish` (auto merge+bump+commit+tag+push)
4. Verify CI release workflow triggered (tag push)
5. Monitor: quality → docker (4 images) → release
6. Verify GitHub Release created

### After release

1. Docker images published to GHCR
2. GitHub Release has correct notes
3. Tag exists and pushed
4. development synced with main: `git checkout development && git merge main`
5. Deploy: `IMAGE_TAG=<ver> docker compose pull && docker compose up -d`
6. Smoke test: `curl -k https://<host>:<port>/ping`
7. Monitor logs: `docker compose logs -f --tail=100`

## 15. Security

- **mTLS:** all services, certs via scripts/generate-certs.sh (CA with SAN: localhost + all service names)
- **Token auth:** HMAC-SHA256 via `x-instance-token` header, issued by discovery-server
- **Zod env validation:** fail-fast at startup (process.exit on invalid)
- **Secrets:** .env, _.key, _.pem, \*.crt in .gitignore; GHCR_TOKEN in GitHub Secrets
- **Deps:** npm audit + Dependabot PRs (high priority)
- **Reporting:** email docteur.turboss@gmail.com, <72h acknowledgement

## 16. Scripts

| Script                    | Purpose                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| scripts/commit.mjs        | Interactive gitmoji commit                                         |
| scripts/release.mjs       | Changelog + version bump (--dry-run, --publish, --bump, --version) |
| scripts/generate-docs.mjs | TypeDoc runner (+ --dry-run)                                       |
| scripts/deploy-beta.ps1   | Canary deploy Windows (2% canary, 5% error threshold)              |
| scripts/deploy-beta.sh    | Canary deploy Unix                                                 |
| scripts/generate-certs.sh | TLS cert generation                                                |
| scripts/hosts.json        | Fleet inventory                                                    |
| scripts/init-db.sql       | MySQL schema (3 tables)                                            |

## 17. Environment Variables

| Category        | Vars                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base            | NODE_ENV, PORT, TLS_KEY/CERT/CA_PATH, LOG_LEVEL                                                                                                                                                   |
| Address-manager | APP_NAME/VER, SERVICE_NAME, INSTANCE_ID, CACHE_TTL_MS, PING_TIMEOUT, TOKEN/TTL_REFRESH_INTERVAL, ADDRESS_MANAGER_URL, ERROR_URL_WEBHOOK, MESSAGE_BUS_INIT/SHUTDOWN_TIMEOUT, MESSAGE_CALLBACK_PATH |
| Discovery       | CLEANUP_SERVICE_INTERVAL_MS                                                                                                                                                                       |
| Trader-trainer  | TRAINER_SYMBOLS, DATA_WINDOW, VALIDATION_SPLIT, GENERATIONS, POPULATION_SIZE, TIME_BUDGET_MS, EPISODES_PER_INDIVIDUAL                                                                             |
| Scraper DB      | DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, DB_PORT (from process.env, no Zod)                                                                                                                        |
| Docker compose  | DISCOVERY/MESSAGE/SCRAPER/TRAINER_PORT, TLS_CERTS_DIR, MYSQL_ROOT_PASSWORD, MYSQL_DATABASE                                                                                                        |

## 18. Code of Conduct

Harassment-free environment. Project maintainers enforce standards. Report violations privately to maintainers. Based on Contributor Covenant v2.1.

## 19. Configuration Files Reference

| File                  | Purpose                                 |
| --------------------- | --------------------------------------- |
| eslint.config.mjs     | ESLint 10 flat config (shared monorepo) |
| .prettierrc           | Prettier config                         |
| commitlint.config.mjs | Commit message validation rules         |
| docker-compose.yml    | 6 services (mongo, mysql + 4 app)       |
| .gitignore            | env, certs, dist, node_modules          |
| .dockerignore         | node_modules, .git, docs                |
