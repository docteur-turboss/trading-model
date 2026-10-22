# ADR-0015: Hexagonal Layering Completion Across Services

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0010](./0010-clean-architecture-migration.md) (target layout, now Implemented), [ADR-0007](./0007-common-package-split.md) (common split, now Implemented), [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) (hard-migration convention)

## Context

The architecture audit of 2026-09-13, re-verified on 2026-10-22, closed two findings (`common` is no longer a god package; message-manager has its hexagonal layers) and left one open: the domain layer was **missing or impure** in trader-trainer (`core/`, 171 files), financial-scraper, audit-logger, dlq-service and discovery-server.

Measured against the layer rules of the [Architecture Standards](../standards/architecture-standards.md) (domain purity, application isolation, service layout), the codebase carried **145** violations at the start of the work: 8 domain-purity, 119 application-isolation, 18 legacy top-level directories.

## Decision

Complete the ADR-0010 migration in every backend service, by **direct migration** (no compatibility re-exports), one phase at a time, each validated by lint, typecheck and the workspace test suites (coverage thresholds included).

### Layer rules applied

| Layer | May depend on | Must not depend on |
| ----- | ------------- | ------------------ |
| `domain/` | primitives, contracts, other `domain/` code | adapters, infrastructure, application (own or another package's), IO/framework libraries (mongodb, ioredis, express, prom-client, node:fs …), `@trading-model/persistence` |
| `application/` | `domain/`, ports, `config/` read-only settings, `@trading-model/contracts/logger-registry` | its own `adapters/` and `infrastructure/`, another package's `adapters/`/`infrastructure/` layers, IO libraries |
| `config/container.ts` | everything | — (composition root: the only place concrete adapters are bound to ports) |

### Conventions established

- **Ports live in `domain/ports/`** (or next to the engine they serve, e.g. `domain/genetic-algorithm/ga-telemetry.ts`) and default to a no-op implementation when they are purely observational (metrics, telemetry).
- **Logging** in domain/application code goes through `getLogger()` from `@trading-model/contracts/logger-registry`, never through `@trading-model/http/infrastructure/logger`.
- **Runtime settings** are injected as plain objects (`SchedulerConfig`, `TrainingSettings`, `DlqReplaySettings`). When configuration may change after wiring, the container exposes them as **getters reading `ENV` on access**.
- **Metrics** reach the domain only through ports or hooks (`DiscoveryMetricsPort`, `GaTelemetry`, `MarketDataBuffer.onDataAdded`); the Prometheus collectors stay in `config/metrics.ts` / `infrastructure/monitoring/`.
- **Reclassify before abstracting**: a file that builds HTTP responses is an inbound adapter, a file that queries MongoDB is an outbound adapter, whatever folder it lived in. Ports are introduced only for the orchestration that genuinely belongs to the application layer.
- Entry points are `src/application/index.ts` in every service (dlq-service and trader-trainer moved from `infrastructure/…`); `package.json` `main`/`dev`, Dockerfile `CMD` and `scripts/generate-docs.mjs` were updated accordingly.

### Changes per workspace

| Workspace | What changed |
| --------- | ------------ |
| discovery-server | `DiscoveryMetricsPort` + `TokenCryptoPort`; `ServiceRegistry`, `InstanceTokenManager`, `StaleInstanceCleaner`, `LeaseManager` receive them by injection; `config/container.ts` (`createServiceRegistry()`); `controllers/` + `routes/` → `adapters/inbound/http/`. Also fixed: the cleaner's start jitter timer was neither `unref()`'d nor cancelled by `stop()`. |
| dlq-service | Eviction policy (MongoDB) → `adapters/outbound/`; HTTP handlers (`add-entry-pipeline`, `dlq-replay-service/response`, `dlq-service`) → `adapters/inbound/`; Mongo `claim-manager` → `adapters/outbound/`; `redis-queue-processor` → inbound adapter; `shutdown-manager` → `config/`; `dlq/shared/*`, `app/*` reclassified. Replay ports (`domain/ports/replay.ports.ts`: claim, claim release, retry ledger, queuable entries, replay queue, entry delivery, message-manager locator, replay audit, settings); `auto-retry-cycle`, `auto-retry-queue`, `claim-release-service`, `redis-claim-replay-orchestrator`, `replay-batch`, `replay-drain-service` are factories/classes over those ports, wired in `config/container.ts`. |
| address-manager (package) | Domain `dns-resolver` no longer re-exports the application `MapResolver`. |
| audit-logger | `JobRepositoryPort`, `WorkerProtocolPort`, `ReAllocatorPort`, `LoggerPort` in `domain/ports/`; scheduler orchestration (`JobScheduler`, assignment, lifecycle, status, failure handling) in `application/scheduler/` with an injected `SchedulerConfig` and orphan-job metric; pure `BackPressure`/`InternalQueue`/job types in `domain/`; controllers/routes/query parsing → `adapters/inbound/http/`; persistence → `adapters/outbound/persistence/`; wiring in `config/container.ts`. |
| message-manager | Broker wiring `application/broker-module.ts` → `config/container.ts`; application services log via `getLogger()`. |
| financial-scraper | `MarketDataRepositoryPort`; `createMarketDataController(repository)`; `WorkerOrchestrator` receives `runWorker`/`persist`; `clients/binance` → `adapters/outbound/binance`, `clients/http` → `adapters/inbound/http`, `infra/…/schema` → `adapters/outbound/persistence/schema`, `job/cron` → `adapters/inbound/cron` + `application/worker-orchestrator.ts`, `job/worker` → `adapters/outbound/binance-worker`; normalized snapshot types → `domain/market-data-snapshot.ts`; obsolete path aliases (`infra/*`, `clients/*`, `job/*`, `types/*`, `utils/*`) removed. |
| trader-trainer | `core/` (pure computation) → `domain/`; `Trainer` and `TrainingSession` → `application/` with injected `TrainingSettings`, `ModelPublisherPort` and `GaTelemetry` (they previously read `ENV` directly and ignored the container's configuration); `model-publisher` → `adapters/outbound/`; `app/event-*` → `adapters/inbound/events/`; training loop → `adapters/inbound/scheduler/`; container → `config/container.ts`. The GA engine (`ga-runner`, `generation-processor`, `evaluation-pipeline`, `evolution-engine`) stays in the domain: it is algorithm code, impure only through logging/metrics, now provided by ports. Dead manual mock `src/config/__mocks__/env.ts` removed. |
| common / contracts / validation | `config/event.types` facade removed (see ADR-0007 outcome); `EventMap` unions → `@trading-model/contracts/event-map`; canonical `Optimizer` enum → `@trading-model/contracts/training-events`. |

### Result

| Rule | Before | After |
| ---- | -----: | ----: |
| domain-purity | 8 | **0** |
| service-layout | 18 | **0** |
| application-isolation | 119 | **74** |
| **Total** | **145** | **74** |

The 74 remaining application-isolation findings are all in **shared packages and api-gateway**, outside the scope of this migration: address-manager 41, api-gateway 7, http 7, crypto 7, server-utils 5, broker-message 4, jobs 2, validation 1. They are typically application services importing a sibling package's `adapters/outbound/http-client` or `express` types.

## Consequences

### Positive

- Every service reads the same way: pure `domain/`, port-driven `application/`, `adapters/`, `infrastructure/`, one `config/container.ts`.
- Domain and application code is unit-testable without `jest.mock` on infrastructure module paths: the reworked specs build the use cases with in-memory port implementations.
- Two latent defects were fixed along the way: the discovery cleaner timer (process kept alive, loop started after `stop()`), and trader-trainer ignoring the GA settings passed to its container.

### Negative

- More files (ports, containers) and one level of indirection in the wiring.
- `shared/` facades in dlq-service (`auto-retry.ts`, `replay-pipeline.ts`, `controller-reexports.ts`) now re-export container-bound functions; they remain for the inbound adapters and are candidates for removal.

### Mitigations

- No compatibility shims were added; every importer was migrated in the same change, so the old paths fail fast.

## Composition Root and Startup (decided 2026-10-22)

Two conventions coexisted: `src/application/{index,server,container}.ts` as exempt composition roots (previous standard), and ADR-0010's "wiring belongs in `src/config/container.ts`".

**Decision:** split the two responsibilities.

- **Dependency wiring** (instantiating adapters, binding them to ports, building use cases) lives **only** in `src/config/container.ts`.
- **Startup** (bootstrap, telemetry, mounting routes, readiness checks, bus subscriptions, opening/closing connections, starting/stopping loops) lives **only** in `src/application/index.ts` and `src/application/server.ts`, the only `application/` files allowed to touch adapters/infrastructure. They get their collaborators from the container. `application/container.ts` is no longer a recognised exception (no service had one).
- Containers receive environment values as parameters instead of importing `ENV`, so tests can import them without environment validation.

Applied the same day:

| Service | Wiring moved from the entry point to `config/container.ts` |
| ------- | ---------------------------------------------------------- |
| discovery-server | instance store selection (in-memory / Redis), Redis client, registry, lease manager → `createDiscoveryApp(ENV)` |
| audit-logger | MongoDB repositories (`infrastructure/repository-factory.ts` removed), subscriber message handler (was built in `server.ts`), whole assembly → `createAuditLoggerApp()` |
| financial-scraper | Binance cron orchestrator → `createScrapeScheduler(ENV)` |
| trader-trainer | ENV → container configuration → `createTraderTrainerContainer(ENV)` (also exposes the parsed symbols for the training loop) |
| api-gateway | readiness HTTP client (was `new HttpClient()` in `server.ts`) → `config/container.ts` |

dlq-service and message-manager entry points already did startup only (connection open/close, schedulers, readiness probes) and were left unchanged. No automated rule enforces this convention; see [Enforcement](#enforcement).

## Enforcement

The automated architecture gate (`scripts/architecture-gate.mjs` with its ratcheted baseline) was removed from the repository during this work. The figures above were measured with an equivalent standalone run of the same rules. Until a gate is reinstated, these boundaries rely on review. The references to the gate in `docs/standards/` (architecture-standards, quality-gates, testing-standards, verification-protocol) describe tooling that is no longer present.
