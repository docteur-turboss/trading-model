# ADR-0029: Orphan Subsystems Retired (audit-logger Job Scheduler, `@trading-model/jobs`) and Reachability Made a Gate

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) (import-reachability removal; its jobs row is corrected here), [ADR-0013](./0013-config-gated-dead-code-removal.md) (dead code that import reachability cannot see), [ADR-0018](./0018-temporary-frontend-removal.md) (frontend removal that orphaned the admin DTOs), [ADR-0027](./0027-audit-chain-verification-and-anchoring.md) (the audit-logger CLI rooted here)
**Verified by:** `bun run reach:check`, `bun run config:check`, `packages/address-manager/tests/unit/create-address-manager.spec.ts`, `packages/address-manager/tests/db/redis-service-cache.db.spec.ts`, `services/audit-logger/tests/unit/persistence/retired-collections.spec.ts`, `services/audit-logger/tests/db/retired-collections.db.spec.ts`, `services/audit-logger/tests/unit/app/index.spec.ts`, `services/audit-logger/tests/unit/app/server.spec.ts`

## Context

The 2026-09-13 architecture audit asked for a formal decision on every orphan subsystem (short-term roadmap item CT8): "~40-50 % dead code per service cannot stay in a no man's land; each subsystem must be removed or wired." Expected result: a removal ADR or a wiring ticket for each one. Done criterion: the orphan share measured by a later audit goes down verifiably.

### Measurement

`scripts/reachability.mjs` (entry points: each service's `main`; edges: static and dynamic imports, `require`, `new Worker`) run on the tree of the audit date and today:

| Workspace | 2026-09-13 | 2026-10-31, before this ADR | After this ADR |
| --------- | ---------- | --------------------------- | -------------- |
| financial-scraper | 84 % | 0 % | 0 % |
| message-manager | 81 % | 0 % | 0 % |
| discovery-server | 64 % | 0 % | 0 % |
| jobs | 53 % | 0 % (but see below) | package removed |
| broker-message | 35 % | 0 % | 0 % |
| audit-logger | 24 % | 2 % (`chain-cli.ts`) | 0 % |
| http | 22 % | 2 % | 0 % |
| validation | 2 % | 57 % (admin DTOs) | 0 % |
| others | 0-7 % | 0 % | 0 % |
| **Monorepo** | **30 %** (17,107 / 57,427 lines) | **1 %** (501 / 45,097) | **0 %** (0 / 42,531) |

The audit's "40-50 % per service" held for the four or five worst services; the monorepo figure was 30 %.

### Decisions already taken

| Orphan subsystem (audit date) | Decision | Where |
| ----------------------------- | -------- | ----- |
| message-manager: Redis Streams, WAL, Mongo archive, WSS server, ACL Redis, DLQ HTTP client | Removed (the DLQ hand-off to dlq-service was later rewired over HTTP) | ADR-0012, ADR-0019 |
| discovery-server: WebSocket server, cached registry, pub-sub invalidator, Redis health monitor | Removed; Redis registry wired | ADR-0012, ADR-0023 |
| broker-message WSS client stack | Removed | ADR-0012 |
| jobs worker client stack | Removed | ADR-0012 |
| http error-tracking stack | Removed | ADR-0012 |
| address-manager load-balancing strategies; discovery WS client | Removed | ADR-0012, ADR-0013 |
| common utilities and barrels | Removed | ADR-0012, ADR-0007 |
| financial-scraper collection pipeline (Binance client, worker, cron: 84 % of the service) | **Wired** to the entry point, not removed | ADR-0026, `market-data-flow.e2e.spec.ts` |
| trader-trainer GA shims, dlq-service lock/decision modules | Removed | ADR-0012 |

### What was left without a decision

1. **audit-logger job scheduler + worker protocol + `@trading-model/jobs`.** `config/container.ts` built a `JobScheduler` (priority queue, back-pressure, ACK deadlines, orphan detection and re-allocation, Mongo collection `audit_jobs`) and a `WorkerProtocol` WebSocket server on the HTTPS server. Import reachability counted all of it as live. At runtime it did nothing:
   - `JobScheduler.submit()` had no caller: no route, no bus subscription, no internal producer;
   - no service implemented a worker: the client stack was removed by ADR-0012, and no workspace opened a WebSocket to audit-logger.

   ADR-0012 calls this server side "operational". It was instantiated, not operational: a server with no peer and a queue with no producer, the class ADR-0013 describes. Its `/health` reported a queue depth that was always 0 and its metrics (`audit_job_count`, `audit_backpressure_ratio`, `audit_worker_count`, `audit_orphan_jobs_total`) stayed constant. It still added a WebSocket upgrade path on the service's HTTPS server, six environment variables and about 2,100 lines (1,450 in audit-logger, 650 in `jobs`) with their tests.
2. **`@trading-model/validation/adapters/inbound/admin`** (9 files, 379 lines): request/response DTOs of the removed `admin-interface`. ADR-0018 removed the frontend but not them.
3. **`@trading-model/http/adapters/inbound/validate-schema.ts`**: superseded by the route registry of ADR-0021, imported only by its own spec.
4. **`services/audit-logger/src/application/chain-cli.ts`**: a false positive. It is the operator CLI of ADR-0027 (`runbook-audit-chain-broken.md`), run with `node dist/application/chain-cli.js`, but it was nobody's `main`.
5. **No gate.** `reach:report` only reported. Nothing stopped the ratio from climbing back, and the script itself was not versioned.

## Decision

### 1. Remove the job scheduler and the worker protocol

Removed from audit-logger: `application/scheduler/`, `domain/scheduler/`, `adapters/outbound/worker/`, the job persistence (`job-repository`, `job-document*`, `job-filter-builder`, `job-status-updater`), `domain/job.types.ts`, the ports `job-repository`, `re-allocator`, `worker-protocol`, `logger-port`, the metrics `audit_job_count`, `audit_backpressure_ratio`, `audit_worker_count`, `audit_orphan_jobs_total`, and the variables `MAX_QUEUE_DEPTH`, `MAX_WORKER_LOAD_RATIO`, `ACK_TIMEOUT_MS`, `MAX_RETRIES_PER_JOB`, `ORPHAN_SCAN_INTERVAL_MS`, `WORKER_HEARTBEAT_TTL_MS` (plus `GAP_DETECTION_INTERVAL_MS` and `LOG_RETENTION_DAYS`, parsed but read by nothing). `GET /health` now returns `{ status, timestamp }`.

Removed with it: the whole `@trading-model/jobs` package (worker protocol, WS manager, registry, health monitor, load balancer, orphan detector, re-allocator), the contracts `recovery-types` and `worker-protocol-types`, the primitives `JobId`/`JobType` and `RetryPolicy`, and the `JobStatusError` error code. `TypedEventEmitter`, the only piece used elsewhere, moves into `@trading-model/broker-message` (its only consumer). The repository now has 11 shared packages.

The `audit_jobs` collection is no longer created. Earlier versions created it at every startup (index creation) and only read it (recovery of non-terminal jobs). No version ever wrote to it: since audit-logger was added (2026-06-10), `submit()` never had a caller, and the `job-scheduler` and `crypto-worker` services removed on 2026-07-01 never contacted audit-logger. At startup audit-logger now drops it when it is empty (`dropRetiredCollections`). If it holds documents (someone wrote to it by hand), it is kept and a warning is logged: data is never deleted automatically. The step can go once every deployment has started a version that has it.

### 2. Remove the other residues

- `packages/validation/src/adapters/inbound/admin/` and its export subpath, with `tests/admin-contracts.spec.ts`. These tests carried most of the package's coverage, so `validateEnv` and `RedisEnvSchema`, which run in every service, are now tested.
- `packages/http/src/adapters/inbound/validate-schema.ts` and its spec.

### 3. Operator CLIs are entry points

A service declares the CLIs operators run in the `bin` field of its `package.json`. The reachability script roots `bin` targets like `main`. audit-logger declares `"audit-chain": "./dist/application/chain-cli.js"`.

### 4. Reachability is a gate

`bun run reach:check` (`node scripts/reachability.mjs --max-lines 0`) fails when any `src` line is unreachable from a `main` or `bin`, or when a spec only exercises unreachable code (it inflates coverage without guarding anything that runs). It runs in pre-push and in the CI `lint` job. The threshold is the baseline of this ADR, 0 lines. It may only go down: new code reaches an entry point in the change that adds it, or does not land.

### 5. Configuration that no deployment turns on is a gate too

The import graph cannot see the class ADR-0013 described, and point 1 above belonged to it. `bun run config:check` (`scripts/config-flags-check.mjs`, pre-push and CI `lint`) implements the guard ADR-0013 recommended. It lists the variables read by the code (Zod env schemas, `process.env.X`, `env.X` / `ENV.X`) and looks them up in the deployment profiles (`.env.example`, `docker-compose.yml`, `deploy/`, the deploy workflow). It fails on:

- an optional variable that no profile sets: the code behind it never runs;
- a switch whose default is `false` that no profile turns on (`true`/`1`, including kustomize patches);
- a required variable that no profile sets: the service cannot start;
- a variable read from a parsed env that no schema declares: Zod drops unknown keys, so it is always undefined.

Exceptions go in `ALLOWED_UNSET`, each with a reason. There are none.

Its first run found nine variables. Reviewing them found two address-manager config fields that no code fills either (`redisCacheUrl`, `pems`); the check does not see those, since no variable is involved. Decisions:

| Variable | What it gated | Decision |
| -------- | ------------- | -------- |
| `ADDRESS_MANAGER_URLS` | Failover across several discovery URLs (multi-region) | Removed: one discovery Service load-balances every replica. `MULTI_REGION.md` now says the platform is single-region |
| `PUBLIC_IP`, `LOCAL_DISCOVERY_URL`, `PREFERRED_NETWORK_INTERFACE`, `METRICS_INTERVAL_MS`, `MAX_CALL_RECORDS` | address-manager options read from the env but declared by no schema, so always undefined; four of them were read by nothing | Removed |
| `DLQ_AUTH_HMAC_SECRET_PATH` | Reading the DLQ HMAC secret from a file | Removed: the secret comes from `DLQ_AUTH_HMAC_SECRET` (Secret in K8s) |
| `LOG_DIR` | Writing logs to files | Removed: services log to stdout (compose `x-logging`, promtail). The redaction specs now assert on stdout, the path that runs |
| `DLQ_AUTO_RETRY_ENABLED` | Automatic replay of dead letters and the Redis worker loop that also releases stale claims | **Wired**: `true` in compose and the K8s ConfigMap. The E2E overlay sets it to `false`, because its suites replay by hand |
| `redisCacheUrl` (config, no variable) | `RedisServiceCache`: addresses and circuit state shared by the replicas | **Wired**: filled from `REDIS_SENTINELS` / `REDIS_URL` via `redisConnectionFromEnv`, in the services that have Redis (dlq-service, message-manager). The other services keep the in-memory cache |
| `pems` (config, no variable) | An alias of `tls` | Removed |

## Alternatives Considered

| Alternative | Reason for Rejection |
| ----------- | -------------------- |
| Wire the scheduler (ticket): give it a producer and a worker | No workload needs distributed job execution. Training runs inside trader-trainer, collection inside financial-scraper's collector, and neither needs an external queue. Wiring it would mean writing the worker client ADR-0012 removed, plus a producer, for no requirement |
| Keep the scheduler "ready" in audit-logger | The ADR-0012 and ADR-0013 reasoning applies: unexercised code rots, and here it also opened a WebSocket path and published constant metrics that looked like signals |
| Move `@trading-model/jobs` out of audit-logger but keep the package | A package with no consumer is the same orphan one level down |
| A percentage threshold (e.g. 5 %) | 1 % of the monorepo is about 450 lines, a whole subsystem. A line count at the baseline catches the first orphan file |
| Keep `reach:report` report-only and rely on future audits | The done criterion of CT8 is a verifiable decrease; without a gate the ratio could only be measured after it had climbed back |

## Consequences

### Positive

- 0 unreachable `src` lines and 0 phantom tests across the 18 workspaces, enforced on every push.
- audit-logger does one thing: record, verify and anchor the audit trail. No WebSocket upgrade path, eight fewer settings, four fewer constant metrics, about 2,100 fewer lines.
- The build has one package fewer; broker-message no longer depends on a job package for an event emitter.

### Negative

- Reintroducing a job system is a rewrite (git history: `git show 73e9f877:packages/jobs`).
- Both gates are static. `config:check` covers settings that no deployment turns on, but a server that no client calls (point 1) is still only caught by review and by the E2E data-flow tests.
- `config:check` matches variable names in the profile text. A profile that names a variable without setting it to a useful value passes, except for `false`-default switches, whose value is checked.
- A file reached only through a computed path (`require(variable)`) fails the gate; it must be declared as an entry point or loaded through a literal path.

## Conditions for Reintroduction

A job scheduler comes back through a new ADR when a workload needs execution outside the service that produces it (long backtests, parallel training across hosts) and running it in-process or as a K8s Job is shown insufficient. It must arrive with its producer and its worker in the same change, and pass `reach:check`.
