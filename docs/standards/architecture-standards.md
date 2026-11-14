# Architecture Standards

## Why

Ensure consistency, maintainability, and scalability across the entire trading-model monorepo. A standardized architecture enables every contributor to quickly understand the structure, add a new service or package without ambiguity, and guarantee interoperability between components.

## How

The project follows a monorepo structure with **bun workspaces**. All shared components live in `packages/` and all microservices in `services/`.

```
trading-model/
├── packages/           # Shared libraries (bun workspace)
│   ├── primitives/          # @trading-model/primitives
│   ├── contracts/           # @trading-model/contracts
│   ├── reliability/         # @trading-model/reliability
│   ├── common/              # @trading-model/common
│   ├── persistence/         # @trading-model/persistence
│   ├── http/                # @trading-model/http
│   ├── validation/          # @trading-model/validation
│   ├── server-utils/        # @trading-model/server-utils
│   ├── crypto/              # @trading-model/crypto
│   ├── address-manager/     # @trading-model/address-manager
│   └── broker-message/      # @trading-model/broker-message
├── services/           # Microservices
│   ├── discovery-server/
│   ├── message-manager/
│   ├── financial-scraper/
│   ├── trader-trainer/
│   ├── api-gateway/
│   ├── audit-logger/
│   └── dlq-service/
├── .github/workflows/  # CI/CD
├── docs/               # Centralized documentation
├── scripts/            # Utilities (commit, release, migrations)
└── biome.json           # Root Biome config
```

### Where

| Location      | Role                                        |
| ------------- | ------------------------------------------- |
| **Root**      | Shared config (Biome, tsconfig)  |
| **packages/** | Reusable libraries (public or internal)     |
| **services/** | Independently deployable microservices      |
| **docs/**     | Centralized project documentation           |
| **scripts/**  | Automation scripts (commit, release, migrations) |

### For Whom

All developers contributing to the codebase. Every architectural decision aims to reduce onboarding time and eliminate structural ambiguity.

> **See also:** [System Overview (C4, K8s deployment, market data flow)](../architecture/system-overview.md), [Bounded Contexts](../architecture/bounded-contexts.md) for DDD context maps, and [Database Schemas](../architecture/databases.md) for table definitions and entity types.

### Technology Stack

| Layer        | Technology                                           |
| ------------ | ---------------------------------------------------- |
| Runtime      | Bun 1.x (Node.js 26-compatible APIs)                 |
| Language     | TypeScript (ES2020; module: node16 or commonjs)      |
| API          | Express.js                                           |
| Frontend     | None for now (ADR-0018)                              |
| Security     | mTLS (all services)                                  |
| Database     | MongoDB (audit-logger, dlq-service), MySQL (financial-scraper), SQLite (SPIRE datastore, ADR-0065), Redis (discovery registry, message-manager subscriptions, dlq-service) |
| Validation   | Zod                                                  |
| Scheduling   | node-cron                                            |
| Formatting   | Biome                                                |
| Linting      | Biome                                                |

Layer boundaries (`application/` never imports `adapters/` or `infrastructure/`, except `index.ts`, `server.ts`, `telemetry.ts`) and the absence of runtime import cycles are enforced by `bun run arch:check`, ratcheted on `scripts/architecture-baseline.json` ([ADR-0015](../adr/0015-hexagonal-layering-completion.md)).

## Dependency Graph

Shared packages (base → derived):

```
@trading-model/primitives       (branded types, pagination, identities — zero deps)
@trading-model/contracts        (events, market-data, http constants, LoggerPort registry) → primitives
@trading-model/reliability      (circuit breaker, latency tracker, heartbeats) → primitives, contracts
@trading-model/common           (residual config, utils, shared schemas, AppError) → primitives, contracts
@trading-model/persistence      (Redis/Mongo connection managers, store adapters) → common, primitives, contracts
@trading-model/http             (HTTP middleware, http client, logging) → primitives, contracts, common, reliability
@trading-model/validation       (Zod schemas, DTOs, shared type contracts) → primitives, contracts, common, http
@trading-model/server-utils     (secure HTTPS server factory, TLS watcher, bootstrap) → primitives, contracts, common, http
@trading-model/crypto           (hashing, signatures, crypto primitives) → primitives, contracts, common, validation

@trading-model/address-manager  (service discovery client, health, token rotation) → primitives, contracts, common, persistence, http, reliability, server-utils, validation
@trading-model/broker-message   (inter-service messaging SDK) → primitives, contracts, address-manager, common, http, validation
```

> **Dependency direction:** `@trading-model/primitives` and `@trading-model/contracts` are the foundation layers and depend on nothing higher in the chain — they must never import `http` or any upper-layer package. `@trading-model/common` sits just above them and has **no** dependency on `@trading-model/http`. The concrete logger lives in `@trading-model/http`; `@trading-model/contracts` exposes a `LoggerPort` registry (`@trading-model/contracts/logger-registry`) that http populates at import time — breaking what was previously a real `common ↔ http` cycle.

Services and their `@trading-model/*` dependencies (the `dependencies` of each `package.json`, checked by `bun run deps:check`; the trader-trainer directory is the package `trader-service`):

| Service | Dependencies |
| --- | --- |
| api-gateway | address-manager, common, contracts, http, primitives, server-utils, validation |
| audit-logger | address-manager, broker-message, common, contracts, http, persistence, primitives, server-utils, validation |
| discovery-server | common, contracts, crypto, http, persistence, primitives, server-utils, validation |
| dlq-service | address-manager, broker-message, common, contracts, crypto, http, persistence, primitives, reliability, server-utils, validation |
| financial-scraper | address-manager, broker-message, common, contracts, crypto, http, primitives, reliability, server-utils, validation |
| message-manager | address-manager, broker-message, common, contracts, crypto, http, persistence, primitives, reliability, server-utils, validation |
| trader-service | address-manager, broker-message, common, contracts, crypto, http, primitives, reliability, server-utils, validation |

There is no frontend workspace: `admin-interface` was removed until a new one is specified ([ADR-0018](../adr/0018-temporary-frontend-removal.md)). A future frontend talks to the backend only through the **api-gateway**.

### Package Dependency Details

| Package                          | Purpose                                                                                                                                                 | Dependencies               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `@trading-model/primitives`      | Pure domain primitives: branded types, pagination, circuit-state, service-identity, retry-policy, topic-binding. Zero dependencies.                       | —                          |
| `@trading-model/contracts`       | Shared contracts: event/market-data types, `http-status`, `http-headers`, `LoggerPort` registry (setLogger/getLogger)                                     | primitives                 |
| `@trading-model/reliability`     | Circuit-breaker, circuit-state-machine, latency-tracker, heartbeat interfaces                                                                            | primitives, contracts      |
| `@trading-model/common`          | Residual shared infra: `AppError`/`ErrorCodes`, retry/backoff, SPIFFE identity, TLS path config, cache abstractions, log sanitization, shared Zod schemas  | primitives, contracts      |
| `@trading-model/persistence`     | Redis/Mongo connection managers, store adapters, key builders (absorbed `redis-config`)                                                                   | common, primitives, contracts |
| `@trading-model/http`            | HTTP middleware (MTLSAuthMiddleware, ResponseProtocol, error tracking), HTTP client, concrete logging pipeline                                              | primitives, contracts, common, reliability |
| `@trading-model/validation`      | Zod schemas, DTOs, event types, shared type contracts, admin contracts                                                                                  | primitives, contracts, common, http |
| `@trading-model/server-utils`    | Secure HTTPS server factory, TLS watcher/loader, bootstrap & shutdown, signal handling, telemetry                                                         | primitives, contracts, common, http |
| `@trading-model/crypto`          | Hashing, request signing, token generation, secure randomness                                                                                           | primitives, contracts, common, validation |
| `@trading-model/address-manager` | Service discovery client, token manager, service cache with health checking, load balancing                                              | primitives, contracts, common, persistence, http, reliability, server-utils, validation |
| `@trading-model/broker-message`  | Inter-service messaging SDK: message manager client, event emitter, message controller/routes, validation schemas                                        | primitives, contracts, address-manager, common, http, validation |

## Workload Identity & Security Model

- All service-to-service HTTP communication uses **HTTPS with mutual TLS** (mTLS); database client traffic is not encrypted (ADR-0060).
- Workload identity is provided by **SPIFFE/SPIRE** (ADR-0011): each workload is
  attested and issued short-lived X.509-SVIDs (with a `spiffe://` URI SAN),
  consumed via `spiffe-helper` sidecars. The former in-house CA and
  `certificate-client` were decommissioned.
- No service trusts another without explicit certificate/bundle validation.
- The Discovery-Server issues and rotates HMAC tokens.
- Live trading will be gated by risk limits, capital exposure constraints, and fail-safe mechanisms (planned).

## Service Conventions

### HTTPS Server with mTLS

Each service exposes an HTTPS server with mTLS enabled. The internal container port is always **3000**, with a unique host port mapping.

| Service           | Host port (dev) | Container port | Notes         |
| ----------------- | --------------- | -------------- | ------------- |
| discovery-server  | 8443            | 3000           |               |
| message-manager   | 8444            | 3000           |               |
| financial-scraper | 8445            | 3000           |               |
| trader-trainer    | 8446            | 3000           |               |
| audit-logger      | 8450            | 3000           |               |
| dlq-service       | 8452            | 3000           |               |
| api-gateway       | 8448            | 3000           |               |

### Service Structure

Services follow a hexagonal architecture (ADR-0010): business logic is isolated in `domain/` + `application/`, driven by `adapters/` (controllers, routes) and backed by `infrastructure/` (Redis, Mongo, HTTP clients). All services use this layout; no legacy module layout (`core/`, `messaging/`, `persistence/`, `controllers/` …) remains (ADR-0015).

```
services/<name>/
├── src/
│   ├── application/        # Startup (index.ts, server.ts) + use-case orchestration over ports
│   ├── domain/             # Entities, domain services, ports (interfaces)
│   ├── adapters/           # Driven/driving adapters (HTTP controllers, routes, clients)
│   │   ├── inbound/        # Express controllers, route definitions
│   │   └── outbound/       # HTTP/WS clients to other services
│   ├── infrastructure/     # External integrations (Redis, MongoDB, HTTP), config/env.ts
│   ├── config/             # container.ts (composition root), metrics, service clients
│   └── shared/             # Shared types, constants, utils
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── helpers/
├── docs/                  # Service-specific documentation
├── Dockerfile
├── package.json
├── tsconfig.json
└── jest.config.js
```

### Composition Root vs. Startup (ADR-0015)

Two distinct responsibilities, two places:

| Responsibility | Where | Examples |
| -------------- | ----- | -------- |
| **Dependency wiring**: instantiate adapters and bind them to ports, build use cases | `src/config/container.ts` only | `new RedisInstanceStore(...)`, `createServiceRegistry()`, `new JobScheduler({ repository, config })`, repositories, publishers, Prometheus hooks |
| **Startup**: run the process | `src/application/index.ts` and `src/application/server.ts` only | `createBootstrap`, telemetry, mounting routes, readiness checks, bus subscriptions, opening/closing connections, starting/stopping loops |

Rules:

- `index.ts` and `server.ts` are the **only** files of `application/` allowed to touch adapters/infrastructure, and only for startup concerns. They obtain their collaborators from `config/container.ts` and never `new` an adapter themselves.
- Every other file of `application/` depends on ports only.
- **Ports**: type `XxxPort` (never an `I` prefix), file `xxx.port.ts` (never `-port.ts` / `.ports.ts`), located in `domain/ports/` (several ports of one concern may share a file). Non-port interfaces: `xxx.interface.ts`; MySQL schemas: `xxx.schema.ts`.
- Containers take environment values **as parameters** (`createDiscoveryApp(ENV)`, `createScrapeScheduler(ENV)`) rather than importing `ENV`, so they can be imported by tests without environment validation.

### Entry Point (`src/application/index.ts`)

```typescript
import { createBootstrap } from '@trading-model/server-utils/application/services/bootstrap';
import { createDiscoveryApp } from '../config/container';
import { ENV } from '../infrastructure/config/env';
import { createServer } from './server';

const { registry, leaseManager, redisClient } = createDiscoveryApp(ENV);

createBootstrap({
  name: 'Discovery',
  createServer: () => createServer(registry),
  onStart: async () => {
    await redisClient?.connect();
    leaseManager.start();
  },
  onStop: () => {
    leaseManager.stop();
    redisClient?.disconnect();
  },
});
```

### Server (`src/application/server.ts`)

```typescript
import { ServiceId } from '@trading-model/primitives/primitives';
import { createServiceServer } from '@trading-model/server-utils/adapters/inbound/service-server-factory';
import { heartbeatRoutes } from '../adapters/inbound/heartbeat.routes';
import { registryRoutes } from '../adapters/inbound/register.routes';
import { env } from '../config/env';

export function createServer() {
  return createServiceServer({
    env,
    serviceId: ServiceId.of('discovery-server'),
    routes: app => {
      app.use('/', registryRoutes());
      app.use('/', heartbeatRoutes());
    },
  });
}
```

## Package Conventions

### Sub-path Exports

Each package declares its exports via the `exports` field in `package.json`. Entry points are organized by sub-path.

**@trading-model/common** (granular exports — residual `config/`, `utils/`, `shared/` after the ADR-0007 split):

```json
{
  "exports": {
    "./config/*": { "types": "./dist/config/*.d.ts", "default": "./dist/config/*.js" },
    "./utils/*": { "types": "./dist/utils/*.d.ts", "default": "./dist/utils/*.js" },
    "./shared/*": { "types": "./dist/shared/*.d.ts", "default": "./dist/shared/*.js" },
    "./tests/*": { "types": "./tests/*.d.ts", "default": "./tests/*.js" }
  }
}
```

> Post-split (2026-10), `common` no longer exports `middleware/`, `worker/`, `recovery/`, `reliability/`, `domain/`, `crl/`, `persistence/`, `http-headers`, `http-status` or `contracts/`. Those live in `@trading-model/primitives`, `@trading-model/contracts`, `@trading-model/reliability`, `@trading-model/persistence`, `@trading-model/http` and `@trading-model/server-utils` respectively (`worker/` and `recovery/` went to `@trading-model/jobs`, removed by ADR-0029). See the [package map](../services/common.md#package-map-post-split).

**@trading-model/validation**, **@trading-model/server-utils**, **@trading-model/crypto**, **@trading-model/address-manager** and **@trading-model/broker-message** (simplified exports):

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./*": { "types": "./dist/*.d.ts", "default": "./dist/*.js" }
  }
}
```

## Adding a New Service

See [How to Add a New Service](../contributing/adding-a-service.md) for a step-by-step guide with directory layout, entry point, Dockerfile, and registration instructions.

## Known Technical Debt

1. **Legacy path aliases**: Some service tsconfigs still define `paths` aliases (`config/*`, `infra/*`, `clients/*`, `job/*`, `types/*`, `utils/*`) that should be replaced with `node16` resolution.
2. **Transitional re-export shims**: Some refactor-introduced barrel files (`export * from`) preserve old import paths while modules move to the new architectural layers. This notably includes `http/src/infrastructure/logger.ts` (re-exporting the logger pipeline now living in `http/src/application/services/logger.ts` — 100+ consumers still import the legacy sub-path). The `common` split (ADR-0007, extended 2026-10) used **hard migration** — no re-export shims were retained in `common`.
