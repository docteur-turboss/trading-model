# ADR-0012: Dead Code Removal via Reachability Analysis and Runtime Entrypoint Fix

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0010](./0010-clean-architecture-migration.md) (layering conventions relied on by the cleanup), [ADR-0002](./0002-redis-pub-sub.md), [ADR-0003](./0003-mongodb-persistence.md), [ADR-0008](./0008-message-broker-choice.md) (decisions whose never-wired implementations are removed here)

## Context

Incremental feature development across the monorepo left a large amount of code that was never reachable from the real runtime entrypoints: transports, persistence layers, and client stacks that were designed (and sometimes documented in earlier ADRs) but never actually wired into the running services. This code still carried full test suites, inflated the maintenance surface, and — worse — made the actual architecture hard to read: a reader could not tell which subsystems were operational and which were aspirational.

A static **reachability analysis** was run on branch `refactor/clean-code-v3`, rooted at the real Docker entrypoint of every service (`CMD` target in each Dockerfile, transpiled from `src/`), with resolution of:

- dynamic imports (`import(...)`, string-literal requires),
- subpath exports of the `@trading-model/*` packages (mapping each export condition to its source file),
- ambient type declarations (see false-positive note below).

Results:

| Milestone                        | Unreachable src files | Ratio       |
| -------------------------------- | --------------------- | ----------- |
| HEAD before cleanup              | 197 / 998             | **19.7 %**  |
| After first cleanup pass (in-flight) | 33 / 839          | **3.9 %**   |
| After this changeset             | ~0 (see note)         | —           |

The first pass removed 236 files (~7,000 lines on `message-manager` alone). The remaining 33 files identified by the audit were removed in this changeset. The full build is green (16/16 workspaces) and the test suites are green, except for 5 pre-existing `admin-interface` failures unrelated to this work (tied to a separate feature rewrite).

The analysis also surfaced a **critical bug**: `message-manager`'s Dockerfile executes `dist/application/index.js`, but `src/application/index.ts` only exported a factory (`createBrokerModule`) with no side effects at load time — the process started, exported a function, and exited. No HTTPS server was ever bound, the container healthcheck could never pass, and Docker kept restarting it. The real bootstrap lived in `src/infrastructure/app/index.ts`, referenced only by tests.

A known limitation of static import analysis is **ambient module augmentation**: `services/financial-scraper/src/types/axios.d.ts` augments the axios types (`config.weight`) and is used by `config/http.ts`, but has no import edge and is invisible to the analysis. It is deliberately **kept** and tracked as a known false-positive class for `.d.ts` files.

## Decision

Remove all code proven unreachable from the runtime entrypoints, and fix the `message-manager` entrypoint by moving the bootstrap to the conventional location. The reachability analysis is **reproducible**: it can be re-run on any commit (same entrypoint roots, same dynamic-import and subpath-export resolution) to detect regressions — new dead code, or entrypoints drifting away from the bootstrap.

### Removals by subsystem

| Subsystem | Decision | Rationale |
| --------- | -------- | --------- |
| **message-manager** — Redis Streams, WAL (file/redis), Mongo archive, WSS server, ACL Redis, DLQ HTTP client (~126 files) | Remove | The operational broker is HTTP-only (`POST /message`, `POST /subscribe`) with an in-memory dispatcher and inline retry. The persistence subsystems (WAL, streams, archive) and the WSS transport were not bound to any runtime route. Mongo persistence and the DLQ HTTP client were planned but never wired — removed rather than maintained dead. The DLQ fallback actually in use is `FileDlqRepository` (local JSONL). |
| **discovery-server** — WebSocket server, Redis "cached registry", cache orchestrator, pub-sub invalidator, Redis health monitor, token-service (32 files) | Remove | The operational discovery is HTTP (`/register`, `/heartbeat`) backed by a plain Redis instance-store. |
| **broker-message** — WSS client stack (`wss-client`, `wss-connection-orchestrator`, `wss-publisher`, `wss-message-dispatcher`, `http-fallback-handler`, `pending-publish-queue`, `wss-connection`) | Remove | The operational broker SDK is HTTP. |
| **jobs** — worker WS client stack (`base-worker`, `worker-client`, `worker-heartbeat`, `job-tracker`, `ack-timer-manager`, …; 15 files) | Remove | Worker communication runs over the HTTP job protocol; the WS client stack was never instantiated. |
| **http** — error-tracking stack (`error-buffer`, `error-report-builder`, `error-tracker`, `error-tracking`, `handle-core-response`, `handle-core-error`, `normalize-db-error`; 12 files + tests) | Remove | Never mounted in the shared HTTP server bootstrap; error handling is done by the existing middleware chain. |
| **address-manager** — load-balancing strategies (round-robin, random, least-connections), `cache-invalidation-handler`, `shared/monitoring` barrel (8 files) | Remove | The operational address selection does not use these strategies; the invalidation handler and monitoring barrel had no runtime consumers. |
| **common** — `ws-reconnect`, `ws-connection`, `ws` barrel, `cache-map-invalidator`, `periodic-sweeper`, `ttl-utils`, `async-deduper`, `retry-file-append`, `order-book-utils`, `failure-count`, `domain/candlestick-query`, `testing` barrel, `utils/cache-config`, `utils/lru-cache`, `contracts/pagination.types` | Remove | Utilities with no runtime consumers outside their own tests; barrels with no runtime importers. |
| **audit-logger**, **financial-scraper** (MySQL `book-ticker` / `order-book-snapshot` schemas — `insertBookTicker`/`insertOrderBookSnapshot` never called, those messages only transit via the broker — plus `utils/sleep`), misc (14 + 2 files) | Remove | Unreferenced modules. **Exception:** `services/financial-scraper/src/types/axios.d.ts` is **kept** — ambient axios module augmentation (`config.weight`) used by `config/http.ts`, invisible to static import analysis. |
| **trader-trainer** — GA re-export shims (`encoding`, `fitness`, `validation`, `encoding-indices`, `genome-validation` + `genome-validation/{index,misc}`, `layer-codec`) | Remove | Shims never referenced by the runtime, only by their own tests. |
| **dlq-service** — `config/distributed-lock`, `config/redis-event-handlers`, `dlq/shared` barrel, `shared/entry-validation`, `domain/decision-service` | Remove | Dead configuration and domain modules identified by the audit. |
| **validation** — `adapters/outbound/distributed-lock.types` | Remove | No consumers after the DLQ distributed-lock removal. |
| **admin-interface** — `components/filter-bar.tsx` | Remove | Unreferenced component. |

### Entrypoint fix (message-manager)

Removing dead code also means "reconnecting" the entrypoints that were only referenced by tests:

- Move the real bootstrap (`createBootstrap` + `createServer` + mounting `ADDRESS_MANAGER_ROUTES` / `MESSAGE_MANAGER_ROUTES`) from `src/infrastructure/app/index.ts` into `src/application/index.ts`.
- Move the broker factory from `src/application/index.ts` to `src/application/broker-module.ts`.
- Delete `src/infrastructure/app/`.

This restores the **"application/index.ts = runtime entrypoint"** convention already followed by 5 of the 8 services, and requires **no Dockerfile or `package.json` `main` change** — the `CMD` target (`dist/application/index.js`) now actually boots an HTTPS server and the healthcheck passes.

## Alternatives Considered

| Alternative | Reason for Rejection |
| ----------- | -------------------- |
| Keep dead code behind feature flags | Flags that are never toggled are dead code too; the code carried tests and docs drift without any consumer to validate it |
| Mark unreachable code with `@dead` annotations / coverage-only exclusion | Keeps the maintenance and cognitive load; build surface stays 20 % larger than reality |
| Keep planned subsystems (Mongo persistence, DLQ HTTP client, WSS) "ready to wire" | Unwired code rots: no runtime consumer means no signal when dependencies or protocols change; reintroduction conditions are documented below instead |
| Minimal fix: change the message-manager `CMD` to point at `infrastructure/app` | Works, but contradicts the entrypoint convention of the majority of services and leaves the misleading "application/index.ts is the entrypoint" assumption in place |

## Consequences

### Positive

- 19.7 % → ~0 % unreachable code; ~270 files / well over 7,000 lines removed across the monorepo.
- The running architecture is now readable straight from the code: HTTP-only broker, HTTP discovery, file-based DLQ fallback.
- `message-manager` boots a real HTTPS server from its Docker entrypoint — fixes a critical restart-loop / healthcheck failure.
- Test and build surface shrinks proportionally; fewer dependencies and faster CI.
- The reachability analysis is reproducible, so regressions (new dead code, or entrypoints drifting away from the bootstrap) can be detected continuously.

### Negative

- Reintroducing a removed subsystem (e.g. Mongo message persistence, WSS push) requires rewriting rather than re-wiring; git history is the recovery path.
- Early ADRs (0002, 0003, 0008) now describe intents that are not (or no longer) implemented in code — this ADR explicitly records that gap.
- Ambient `.d.ts` files are invisible to the static analysis: `financial-scraper/src/types/axios.d.ts` is a known, deliberate exception and must be kept even though it looks unreachable.

### Mitigations

- Reintroduction conditions are documented below, tied to measurable triggers.
- Git history preserves the removed implementations for reference.
- The reachability check can be added as a CI gate on the 3.9 %→0 % baseline to prevent accumulation.

## Conditions for Reintroduction

Removed subsystems may be re-wired (from git history or rewritten) when one of the following conditions holds:

| Subsystem | Reintroduce when |
| --------- | ---------------- |
| Message persistence (Mongo archive / WAL) | Sustained DLQ volume exceeds the practical limit of the local `FileDlqRepository` JSONL file (growth, multi-node deployment of message-manager, or a requirement to replay messages across restarts of different hosts) |
| DLQ HTTP client | The DLQ service is deployed as a central, cross-host dead-letter sink rather than per-instance files |
| WSS transport (broker, discovery, jobs workers) | A concrete requirement for server-initiated push / real-time updates arrives (e.g. streaming subscriptions with sub-second latency); polling/webhook proves insufficient |
| Redis Streams messaging | A requirement for durable, back-pressured, multi-consumer fan-out beyond what the HTTP broker provides |
| Load-balancing strategies (address-manager) | Measured hot-spots on address selection (uneven request distribution with real throughput impact) that the current selection cannot address |
| Error-tracking stack (`http`) | A requirement for in-process error buffering/reporting to an external tracker is confirmed; otherwise use structured logs + external APM |
| Distributed lock (dlq-service / validation) | Multi-instance coordination of DLQ consumers becomes necessary (more than one dlq-service replica processing the same queue) |
| GA re-export shims (trader-trainer) | External consumers (other repos, notebooks) adopt the shim surface as a public API |

Any reintroduction must wire the subsystem into a **runtime entrypoint** (route, scheduled job, or bootstrap side effect) — not merely into tests — and must be covered by the reachability analysis without appearing as dead code.
