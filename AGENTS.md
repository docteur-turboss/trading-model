# AGENTS.md

## Quick commands

```bash
npm ci                  # Install all workspace deps
npm run build           # Build 4 shared packages in order
npm run build:ts        # Build everything (packages + all 9 services)
npm test --workspaces   # Run all workspace tests
npm test -w <name>      # Run a single workspace's tests
npm run lint            # Biome check across the whole monorepo
npm run test:coverage   # All tests with coverage
npm run test:contract   # Contract tests (tests/contract/)
npm run test:e2e        # E2E tests (requires Docker Compose up)
npm run docs:generate   # TypeDoc HTML into docs/architecture/code/
npm run commit          # Interactive gitmoji commit CLI
npm run release         # Version bump + changelog + tag + push
```

## Monorepo layout

- `packages/` — 5 shared libraries under `@trading-model/*` scope
- `services/` — 9 microservices (flat npm names, no scope)
- All linked via npm workspaces (`packages/*` and `services/*`)

## Build order (dependency chain)

Packages must be built in this order before services:

1. `@trading-model/common`
2. `@trading-model/address-manager`
3. `@trading-model/broker-message`
4. `@trading-model/certificate-utils`

Services can then be built in any order. The root `npm run build` builds only the 4 packages above. Use `npm run build:ts` for a full build of everything.

## Naming quirk: trader-trainer ≠ trader-service

The directory `services/trader-trainer/` has `package.json` name `"trader-service"`.
Workspace commands use the npm name: `npm test -w trader-service`, `npm run -w trader-service build`.
The root script references the directory path: `npm run -w services/trader-trainer build`.

## admin-interface is different

- **Not Jest** — uses **Vitest** (`vitest run` with `vitest.config.ts`)
- **Not tsc** — builds with `tsc && vite build` (React SPA)
- **Not CommonJS** — only ESM workspace (`"type": "module"`)
- Dev server: `npm run -w admin-interface dev` (port 5173)
- Test environment: `jsdom`

## Testing conventions

- All tests use `**/?(*.)+(spec).ts` pattern (admin-interface uses `.spec.{ts,tsx}`)
- Jest configs use `ts-jest` preset and `moduleNameMapper` to resolve `@trading-model/*` to relative source paths — packages don't need to be pre-built to run tests
- **Serial tests:** `certificate-utils` and `certificate-authority` use `maxWorkers: 1` (crypto operations)
- **Coverage thresholds:** 100% for most workspaces; `dlq-service` at 80%; `trader-service` at 80-85%
- E2E tests: `testTimeout: 30000`, `forceExit: true`, `detectOpenHandles: true`

## Git hooks (Husky) & commit format

- **`pre-push`** runs: biome check → build → test (must all pass to push)
- **`commit-msg`** enforces gitmoji format via commitlint: `:emoji:(scope): subject`
- Scopes are lowercased and must be from the allowed enum in `commitlint.config.mjs`
- Use `npm run commit` for an interactive TUI that helps craft valid commits

## Linting (Biome)

- ESLint fully removed v2.0.4 — Biome gère lint, format, et organiseImports
- `organizeImports` remplace `eslint-plugin-import-x` pour le tri des imports
- Les règles TypeScript avancées (PascalCase interfaces, naming convention) sont configurées dans `biome.json`
- Test files get relaxed rules via `overrides` dans biome.json

## TypeScript

- **No root tsconfig.json** — each workspace has its own standalone config
- Some packages use `tsconfig.build.json` that extends the base but overrides `rootDir` to `"./src"`
- Packages use `commonjs` module; most services use `Node16` module (`moduleResolution: node16`)
- Several services use `experimentalDecorators` + `emitDecoratorMetadata`

## Databases & migrations

- **MySQL** for financial-scraper (market data: candles, trades, tickers)
- **MongoDB** for audit-logger, dlq-service, certificate-authority
- **Redis** for message-manager (HA sentinel) and certificate-authority (standalone)
- SQL migrations: `npm run migrate:up|down|status|create` — custom migrator at `scripts/migrate.mjs`
- MySQL bootstrap SQL at `scripts/init-db.sql` (used by Docker on first start)
- Knex config exists in `services/financial-scraper/knexfile.ts` but uses the same MySQL

## Docker Compose

- 20+ containers with health-check-based startup ordering
- All services expose HTTPS on container port 3000, fronted by nginx LBs where HA
- mTLS everywhere — services need certs generated before starting (`scripts/generate-certs.sh`)
- Required env vars from `.env.example`: `AUTH_TOKENS`, `SERVICE_BOOTSTRAP_TOKEN`, `HMAC_SECRET`, `MYSQL_ROOT_PASSWORD`
- `DNS_NAME_MAP` JSON env var needed for non-Docker environments to resolve service hostnames

## CI/CD

- CI (`ci.yml`): lint → typecheck → audit → test+coverage → migration verify → K8s validate → container scan → secrets scan → SBOM → contract tests → E2E (Docker) → load tests
- Release (`release.yml`): quality gates → Docker build+sign+scan (9 images matrix) → GitHub Release → TypeDoc docs → K8s manifest validate → deploy staging → deploy production (canary with rollback)
- Codecov upload on test job
