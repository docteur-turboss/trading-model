# AGENTS.md

## Quick commands

```bash
bun install --frozen-lockfile   # Install all workspace deps from bun.lock
bun run build                   # Build 6 shared packages in order
bun run build:ts                # Build everything (packages + all 8 services)
bun run test                    # Run all workspace tests
bun run --filter <name> test    # Run a single workspace's tests
bun run lint                    # Biome check across the whole monorepo
bun run test:coverage           # All tests with coverage
bun run docs:generate           # TypeDoc HTML into docs/architecture/code/
bun run commit                  # Interactive gitmoji commit CLI
# Release: run the "Release" workflow in GitHub Actions (Actions → Release).
# It bumps versions + CHANGELOG via scripts/release.mjs, then builds images,
# creates the GitHub Release and publishes docs. No local release command.
```

## Monorepo layout

- `packages/` — 6 shared libraries under `@trading-model/*` scope (common, validation, server-utils, crypto, address-manager, broker-message)
- `services/` — 8 microservices (flat npm names, no scope)
- All linked via bun workspaces (`packages/*` and `services/*`)

## Build order (dependency chain)

Packages must be built in this order before services:

1. `@trading-model/common`
2. `@trading-model/validation` + `@trading-model/server-utils` (extracted from common, depend on it)
3. `@trading-model/crypto` (depends on validation + common)
4. `@trading-model/address-manager`
5. `@trading-model/broker-message`

Services can then be built in any order. The root `bun run build` builds the packages above. Use `bun run build:ts` for a full build of everything.

## Naming quirk: trader-trainer ≠ trader-service

The directory `services/trader-trainer/` has `package.json` name `"trader-service"`.
Workspace commands use the package name: `bun run --filter trader-service test`, `bun run --filter trader-service build`.
The root script references the package name too: `bun run --filter trader-service build`.

## admin-interface is different

- **Not Jest** — uses **Vitest** (`vitest run` with `vitest.config.ts`)
- **Not tsc** — builds with `tsc && vite build` (React SPA)
- **Not CommonJS** — only ESM workspace (`"type": "module"`)
- Dev server: `bun run --filter admin-interface dev` (port 5173)
- Test environment: `jsdom`

## Testing conventions

- All tests use `**/?(*.)+(spec).ts` pattern (admin-interface uses `.spec.{ts,tsx}`)
- Jest configs use `ts-jest` preset and `moduleNameMapper` to resolve `@trading-model/*` to relative source paths — packages don't need to be pre-built to run tests
- **Serial tests:** none currently require `maxWorkers: 1` (previously `certificate-utils` and `certificate-authority`, decommissioned per ADR-0011)
- **Coverage thresholds:** 100% for most workspaces; `dlq-service` at 80%; `trader-service` at 80-85%
- E2E tests: `testTimeout: 30000`, `forceExit: true`, `detectOpenHandles: true`

## Git hooks (Husky) & commit format

- **`pre-push`** runs: biome check → build → test (must all pass to push)
- **`commit-msg`** enforces gitmoji format via commitlint: `:emoji:(scope): subject`
- Scopes are lowercased and must be from the allowed enum in `commitlint.config.mjs`
- Use `bun run commit` for an interactive TUI that helps craft valid commits

## Linting (Biome)

- ESLint fully removed v2.0.4 — Biome handles lint, format, and organizeImports
- `organizeImports` replaces `eslint-plugin-import-x` for import sorting
- Advanced TypeScript rules (PascalCase interfaces, naming convention) are configured in `biome.json`
- Test files get relaxed rules via `overrides` in biome.json

## TypeScript

- **No root tsconfig.json** — each workspace has its own standalone config
- Some packages use `tsconfig.build.json` that extends the base but overrides `rootDir` to `"./src"`
- Packages use `commonjs` module; most services use `Node16` module (`moduleResolution: node16`)
- Several services use `experimentalDecorators` + `emitDecoratorMetadata`

## Databases & migrations

- **MySQL** for financial-scraper (market data: candles, trades, tickers) and SPIRE Server datastore (ADR-0011)
- **MongoDB** for audit-logger, dlq-service
- **Redis** for message-manager (HA sentinel)
- SQL migrations: `bun scripts/migrate.mjs up|down|status|create` — custom migrator at `scripts/migrate.mjs`
- MySQL bootstrap SQL at `scripts/migrations/` (applied by the `migrate` service in Docker)
- Knex config exists in `services/financial-scraper/knexfile.ts` but uses the same MySQL

## Docker Compose

- 20+ containers with health-check-based startup ordering
- All services expose HTTPS on container port 3000, fronted by nginx LBs where HA
- mTLS via SPIRE (ADR-0011): `spire-server` + `spire-agent` (docker attestor / k8s_psat) + `spiffe-helper` sidecars; mandatory in Docker and K8s — no `./certs` bundle or per-service secrets to generate/manage
- Required env vars from `.env.example`: `MYSQL_ROOT_PASSWORD`
- `DNS_NAME_MAP` JSON env var needed for non-Docker environments to resolve service hostnames

## CI/CD

- CI (`ci.yml`): lint → typecheck → audit → test+coverage → migration verify → K8s validate → container scan → secrets scan → SBOM → contract tests → E2E (Docker) → load tests
- Release (`release.yml`): quality gates → Docker build+sign+scan (8 images matrix) → GitHub Release → TypeDoc docs → K8s manifest validate → deploy staging → deploy production (canary with rollback)
- Codecov upload on test job
