# AGENTS.md

## Quick commands

```bash
bun install --frozen-lockfile   # Install all workspace deps from bun.lock
bun run build                   # Build all 11 shared packages in topological order
bun run build:ts                # Build everything (packages + all 7 services)
bun run test                    # Run all workspace tests
bun run --filter <name> test    # Run a single workspace's tests
bun run lint                    # Biome check across the whole monorepo
bun run deps:check              # Verify @trading-model/* imports match package.json manifests (ADR-0016)
bun run api:check               # OpenAPI up to date + documented routes reach real routes + every service-to-service route has a caller, no WebSocket server (ADR-0029)
bun run api:write               # Regenerate docs/services/openapi/api-gateway.yaml from the routes
bun run adr:check               # Every live ADR names its check; supersession + index consistent
bun run test:contract           # Cross-service contracts, real code on both sides: messages (scraper/trainer → message-manager → trainer/audit-logger), dead letters, discovery (address-manager + gateway → discovery-server)
bun run reach:report            # Report src no service entry point (main/bin) reaches (--list for files)
bun run reach:check             # Gate: fails on any unreachable src line or spec of dead code (ADR-0029)
bun run config:check            # Gate: fails on an env var no deployment sets that gates code, or read but never parsed (ADR-0013)
bun run test:coverage           # All tests with coverage
bun run test:db                 # Specs against real Mongo/Redis/MySQL (Testcontainers, needs Docker)
bun run docs:generate           # TypeDoc HTML into docs/architecture/code/
bun run commit                  # Interactive gitmoji commit CLI
bun run release                 # Bump versions + CHANGELOG, tag vX.Y.Z and push it (scripts/release.mjs)
# The tag triggers the "Release" workflow: whole CI, then images :X.Y.Z (+ :latest if highest stable)
```

## Monorepo layout

- `packages/` — 11 shared libraries under `@trading-model/*` scope: `common`, `primitives`, `contracts`, `reliability`, `persistence`, `http`, `validation`, `server-utils`, `crypto`, `address-manager`, `broker-message`
- `services/` — 7 microservices (flat npm names, no scope). Every `src` file must be reachable from a service `main` or `bin` (operator CLIs such as audit-logger `chain-cli` go in `bin`): `reach:check`, threshold 0 (ADR-0029). No frontend: `admin-interface` was removed (ADR-0018)
- All linked via bun workspaces (`packages/*` and `services/*`)
- **No cyclic dependencies**: `primitives` (zero deps) and `contracts` are the foundations — never import `@trading-model/http` or any higher package from them

## Build order (dependency chain)

Packages must be built in this order before services:

1. `@trading-model/primitives` (zero dependencies — branded types, domain primitives)
2. `@trading-model/contracts` (depends on primitives; owner of every shared runtime-free contract — events, message envelope, service registry, signed request, DLQ, recovery/worker protocol — plus http-status/headers, logger-registry; see ADR-0016)
3. `@trading-model/reliability` (depends on primitives + contracts; circuit breakers, latency tracker)
4. `@trading-model/common` (depends on primitives + contracts; residual: config, utils, shared schemas)
5. `@trading-model/persistence` (depends on common + primitives + contracts; Redis/Mongo stores)
6. `@trading-model/http` (depends on common; middleware, http client, logging)
7. `@trading-model/validation` + `@trading-model/server-utils` (depend on common + http)
8. `@trading-model/crypto` (depends on validation + common)
9. `@trading-model/address-manager`
10. `@trading-model/broker-message`
Services can then be built in any order. The root `bun run build` builds the packages above. Use `bun run build:ts` for a full build of everything.

## Naming quirk: trader-trainer ≠ trader-service

The directory `services/trader-trainer/` has `package.json` name `"trader-service"`.
Workspace commands use the package name: `bun run --filter trader-service test`, `bun run --filter trader-service build`.
The root script references the package name too: `bun run --filter trader-service build`.

## Testing conventions

- All tests use `**/?(*.)+(spec).ts` pattern
- Jest configs use `ts-jest` preset; their `@trading-model/*` `moduleNameMapper` is generated from the workspace manifest by `scripts/jest-workspace-mapper.cjs` (declared deps + transitive runtime deps → package `src`) — packages don't need to be pre-built, and undeclared internal packages don't resolve
- **Serial tests:** none currently require `maxWorkers: 1` (previously `certificate-utils` and `certificate-authority`, decommissioned per ADR-0011)
- **Coverage thresholds:** 80% (statements/functions/lines/branches) for all workspaces; branch-only exceptions: `broker-message` 75%, `message-manager` and `dlq-service` 79%
- E2E tests: `testTimeout: 30000`, `forceExit: true`, `detectOpenHandles: true`. Run them against the compose stack with the overlay `tests/e2e/docker-compose.e2e.yml` (Binance stub, 10s scrape): `market-data-flow.e2e.spec.ts` asserts data reaches MySQL and the trainer. Services only accept SPIFFE mTLS clients, so assertions run inside the stack (`docker exec`); external calls go through the `edge-proxy` (host port 8449, `externalRequest`)
- DB tests: `tests/db/**/*.db.spec.ts` run against real databases started by Testcontainers (images read from `docker-compose.yml`). Opt a workspace in with a `jest.db.config.js` built by `scripts/jest-db-config.cjs` (`dbJestConfig(base, { databases })`), add `DB_SPEC_IGNORE` to its default `testPathIgnorePatterns`, and a `test:db` script with `NODE_OPTIONS=--experimental-vm-modules` (the mongodb driver needs it under Jest). Connection strings: `TEST_MONGO_URI` (replica set), `TEST_REDIS_URL`, `TEST_MYSQL_URI`. Not part of `bun run test` / pre-push

## Alerting

- Rules: `observability/alerting.yml`, copied by hand into the K8s ConfigMap in `deploy/k8s/infra/prometheus.yaml`; Alertmanager: `observability/alertmanager.yml`, copied into `deploy/k8s/infra/alertmanager.yaml`. `scripts/observability-gate.mjs` fails when the copies differ, when a rule reads a metric nobody emits, or when a receiver has an inline credential
- Every rule change needs a case in `tests/alerts/alerting.test.yml` (`bash tests/alerts/run.sh`: promtool, local or from the compose Prometheus image). Aggregate before dividing (`sum by (job)`), guard numerators that may not exist (`or denominator * 0`), `sum by (job, le)` for quantiles
- Receivers read files only (Secret `alertmanager-credentials` from `deploy.yml`; compose `ALERTMANAGER_CREDENTIALS_DIR`). `Watchdog` always fires and goes to the dead man's switch (`DEADMAN_URL`). See `docs/operations/ALERTING.md`

## Git hooks (Husky) & commit format

- **`pre-push`** runs: biome check → deps:check → api:check → adr:check → reach:check → config:check → observability gate → build → test → test:contract (must all pass to push)
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
- **MongoDB** for audit-logger, dlq-service. The audit trail is a hash chain (ADR-0027): audit-logger verifies it every 15 min and anchors the verified head in an S3 bucket with Object Lock (`AUDIT_ANCHOR_*`, Secret `audit-anchor-s3`, required in production); never edit `audit_events` / `audit_chain_state` by hand, a loss after a restore is acknowledged with `chain-cli.js acknowledge-loss` (runbook-audit-chain-broken). Store events as hashed (`ignoreUndefined`)
- **Redis** for discovery-server, dlq-service and message-manager readiness. K8s runs it HA: StatefulSets `redis` (master + 2 replicas) and `redis-sentinel` (3), both started by `deploy/k8s/infra/redis-ha.sh`. Services connect through the sentinels (`REDIS_SENTINELS`, IP or DNS `host:port` list) and fall back to `REDIS_URL` (compose/dev); parsed by `redisConnectionFromEnv` (`@trading-model/persistence/redis-env`). No Service points at the master: never use a pod name as the master. Discovery registry in Redis (ADR-0023): never `KEYS`, list services from `ALL_SERVICE_NAMES`. Compose Redis: snapshots always, AOF per environment (`REDIS_APPENDONLY`, default `no` for dev; `scripts/restore.sh` rebuilds the AOF from the restored snapshot when it is on)
- SQL migrations: `bun scripts/migrate.mjs up|down|status|create` — custom migrator at `scripts/migrate.mjs`
- MySQL bootstrap SQL at `scripts/migrations/` (applied by the `migrate` service in Docker)

## Docker Compose

- 20+ containers with health-check-based startup ordering
- No frontend (ADR-0018). External HTTP enters through `edge-proxy`: stock nginx (digest-pinned) with `deploy/edge-proxy/default.conf`, shared with K8s (ConfigMap generated by `deploy/edge-proxy/kustomization.yaml`). It forwards `/v1` to the gateway with its own SVID; `edge-proxy` is the only caller the gateway ACL allows. The gateway only proxies the routes of `PUBLIC_ROUTES` (`services/api-gateway/src/shared/public-routes.ts`, source of the OpenAPI): it calls services with its own SVID, so a service-to-service route must never be added there
- All services expose HTTPS on container port 3000, fronted by nginx LBs where HA
- mTLS via SPIRE (ADR-0011): `spire-server` + `spire-agent` + `spiffe-helper` sidecars; mandatory in Docker and K8s — no `./certs` bundle or per-service secrets to generate/manage. Compose: `spire-bootstrap` (tooling image `deploy/spire/`, configs `deploy/compose/spire/`) registers one entry per `spiffe-helper-<x>` (Docker label selector), exports the bundle and mints the agent join token; the agent attests workloads by Docker label (`pid: host`). K8s: k8s_psat, bundle via the `spire-bundle` ConfigMap, entries reconciled by the `spire-entries` sidecar (image `spire-tools` from `deploy/spire/`). The application namespace enforces the `restricted` Pod Security profile (no hostPath): the SPIRE agent, the SPIFFE CSI driver (pods mount the agent socket as a `csi.spiffe.io` volume) and promtail live in the privileged `trading-model-node` namespace (`deploy/k8s/node-agents`, applied per environment through `overlays/<env>/node-agents`). Discovery keeps instance tokens in Redis: every replica validates every heartbeat. spiffe-helper only takes `-config <hcl>` (`deploy/compose/spire/helper.conf`, ConfigMap `spiffe-helper-config` in K8s)
- Service images build with bun but run on **Node**: Bun exposes neither the peer certificate on HTTPS request sockets nor `server.setSecureContext`, which caller identity and SVID rotation need
- Every service logs through the `x-logging` anchor (json-file, 10m × 3): a new service must use it too
- Tear down every ad hoc stack (`docker compose -p <name> down -v --rmi local`) and kind cluster (`tests/k8s/run-kind.sh delete`; `all` deletes its own unless `KEEP_CLUSTER=1`) once done: Docker Desktop's disk image lives on C: and never shrinks; when C: filled up (2026-10-28) the whole Docker VM froze, taking down an unrelated production project on the same host
- Each compose service has its own `INSTANCE_ID`; never set a shared one in `.env` (discovery keys tokens and addresses by instance id)
- Required env vars from `.env.example`: `MYSQL_ROOT_PASSWORD`, `GATEWAY_AUTH_TOKENS` (gateway API keys: in production it refuses to start without one), `SIGNING_SECRET` (discovery instance tokens: in production it refuses to start without one; K8s reads it from the `trading-model-secrets` Secret)
- `DNS_NAME_MAP` JSON env var needed for non-Docker environments to resolve service hostnames

## CI/CD

- CI (`ci.yml`): lint → typecheck (packages + all services) → test+coverage (Codecov) → DB integration (Testcontainers) → contract tests → E2E (Docker stack) → K8s smoke test (`k8s` job: staging overlay on kind via `tests/k8s/run-kind.sh`, then the `deploy.yml` gates `smoke` (deploy-k8s.sh smoke-test) and `verify_canary` (api-gateway canary, needs `jq`), also runnable locally with `KIND=<path to kind> bash tests/k8s/run-kind.sh`; CI-only adaptations in `tests/k8s/ci-render.mjs`: Binance stub, no HPA/VPA, CPU requests ÷4; the job unloads the runner AppArmor profile `usr.sbin.mysqld` first (attached by path, it confines the pod mysqld inside kind: EACCES on `/etc/my.cnf`, do the same on any Ubuntu host with MySQL installed); also runs a restore drill: `db-backup` CronJob with a throwaway age key and off-site copy to an in-cluster S3 (`tests/k8s/backup-s3.yaml`), writes more data after the dump, stops the writers, records an instant, runs `db-backup-incremental` once, then drops data and the SPIRE volume and restores as after the loss of the cluster: `tests/k8s/restore-runner.yaml` (no `backup-data` mount, `run-kind.sh` refuses to go on if a PVC is mounted) fetches the newest complete run and its binlog / oplog archives from that S3 with `scripts/fetch-offsite.sh --pitr` into an `emptyDir` `/restore`, then runs `scripts/restore-k8s.sh --until <instant>` with `BACKUP_DIR=/restore`; fetch and restore durations are logged; checks on the PVC itself (no plaintext, `backup_encrypted` / `offsite` metrics) and the incremental archives go through the `backup-inspector` pod, deleted before the disaster)
- Release (`release.yml`): push of a `vX.Y.Z` tag (`bun run release`) → whole CI (`ci.yml` as reusable workflow) → 9 images to `IMAGE_REGISTRY` (default `ghcr.io/<owner>`) as `X.Y.Z`; `latest` only when it is the highest stable tag. Manifests keep the logical name `ghcr.io/trading-model/*`
- Deploy resolves the tag (`v` prefix accepted) to digests and applies by digest (missing image fails before any change; `rollout undo` works with `latest`); production refuses placeholder SealedSecrets or a cluster without the Sealed Secrets CRD. `tests/k8s/check-overlays.mjs` (CI `k8s-overlays`) checks every overlay image is in `deploy.yml` `IMAGES` and in the release matrices, and that every Deployment that may run several pods (replicas or HPA) has `topologySpreadConstraints` on `kubernetes.io/hostname` with `DoNotSchedule` (ADR-0024: maxSkew 1, zone soft, `nodeTaintsPolicy: Honor`, `matchLabelKeys: pod-template-hash`)
- Deploy (`deploy.yml`): manual `workflow_dispatch` → staging or production (optional canary with smoke test + auto rollback)
- Backup test (`backup-test.yml`, weekly + on script changes): `tests/backup/backup-encryption.test.sh`, `tests/backup/backup-key-verify.test.sh` (two age recipients in production, `scripts/verify-backup-key.sh`) and `tests/backup/backup-partial.test.sh` (need `age`), `tests/backup/pitr-chain.test.sh`, `tests/backup/backup-retention.test.sh` (GFS retention, 400 days of fake runs), `tests/backup/backup-bucket-check.test.sh` (Object Lock check of the off-site bucket, stub `aws` CLI), `tests/backup/fetch-offsite.test.sh` (off-site fetch against a local `rclone serve s3` fed by `upload_offsite`; runs in the `backup-tools` image built from `deploy/backup`, since `rclone serve s3` needs rclone ≥ 1.65) and the Docker restore drill `tests/backup/compose-restore-drill.sh` (deletes containers and volumes, restores; uses the fixed `trading-*` container names, so it refuses to run next to another compose stack; on Git Bash run it with `MSYS_NO_PATHCONV=1`)

## Encryption at rest

- No database-level encryption (community editions). Host data disks: LUKS2 + Clevis/Tang (or TPM2) via `deploy/host/` (`tang-server.sh`, `encrypt-data-disk.sh`, `check-encryption.sh`); Tang never runs on the host it unlocks. See `docs/deployment/ENCRYPTION_AT_REST.md`
- Backups: `scripts/backup-lib.sh` (sourced by the 4 backup/restore scripts) pipes every dump through `age` (`BACKUP_AGE_RECIPIENTS`, files `*.age`, restore with `BACKUP_AGE_IDENTITY`; production needs 2 distinct recipients, operator + escrow key: `BACKUP_MIN_RECIPIENTS=2` in the overlay, checked by `deploy.yml`; prove a key decrypts the newest off-site run with `scripts/verify-backup-key.sh`: escrow key weekly by the `backup-key-check.yml` workflow (secret `BACKUP_ESCROW_AGE_IDENTITY` of the environment `backup-key-check`, ADR-0034), operator key quarterly by hand, `ENCRYPTION_AT_REST.md` "Key custody"); never write a dump to disk before encrypting it. Write dumps only through `write_dump` (`.partial` renamed on success, sha256 of the plaintext into the run manifest `manifests/manifest_<TIMESTAMP>.json.age`); restores pick a backup only through `resolve_backup` (newest run whose manifest lists the component, checksum verified), never by sorting file names (issue #288). Retention is GFS (ADR-0032): `prune_old` ages files by the timestamp in their name (never the mtime), promotes only complete runs (manifest + final file) of `RETENTION_LONG_COMPONENTS` (`mongodb-audit mysql`), never deletes the newest complete run of a component; the CronJob keeps dailies only on `backup-data` and copies off-site under `daily/`, `weekly/`, `monthly/` (`BACKUP_OFFSITE_LAYOUT=tiered`), expired by bucket lifecycle rules (31/85/1830 days). Off-site copy (rclone, `:s3:` remote) only sends `.age` files. The off-site bucket has Object Lock in compliance mode, default retention 30-31 days, and credentials without delete right (ADR-0033): `deploy.yml` checks it before applying (`scripts/backup-bucket-check.sh`), error in production unless `BACKUP_S3_IMMUTABILITY_CHECK=warn`, warning elsewhere. K8s CronJob runs image `backup-tools` (`deploy/backup`, released by `release.yml`) with `BACKUP_REQUIRE_ENCRYPTION=true` and `BACKUP_REQUIRE_OFFSITE=true`; recipients come from the `backup-encryption` ConfigMap and the off-site store from the `trading-model-backup-s3` Secret, both written by `deploy.yml` from the GitHub environment. Redis is not backed up (derived state). Restore MySQL (SPIRE datastore) before the SPIRE CA keys; MySQL dumps carry no GTID statement (`--set-gtid-purged=OFF`, older dumps filtered by `strip_gtid`)
- Point-in-time recovery (ADR-0031, RPO 1 h): CronJob `db-backup-incremental` (`scripts/backup-incremental-k8s.sh`, hourly) archives closed MySQL binlogs and MongoDB oplog slices, sealed, through `.partial` files, kept 72 h (daily dumps only beyond); the chain state is in the file names (`<binlog>_<stamp>`, `<from>_<end>`), never elsewhere. Each daily dump writes a sealed `.pitr` file (binlog coordinates via `--source-data=2`, oplog point read before the dump). `restore-k8s.sh --until <instant>` refuses (exit 1, nothing touched) a gap or archives that stop before the instant; binlogs replay with `mysqlbinlog --skip-gtids` (in `backup-tools`, Oracle Linux base: the mysql image has no mysqlbinlog) through `mysql-primary`. Its metrics carry `run="incremental"` in their own file (`backup-incremental.prom`), never the same series as the daily job; each run re-copies every local archive off-site (`record_incremental_archives`: a failed copy is caught up) and publishes `backup_pitr_gap` from the archive names (alert `BackupPitrGap` stays firing after a gap until the next daily dump)
- Codecov upload on the test job
