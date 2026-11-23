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
│   ├── crypto/              # @trading-model/crypto
│   ├── address-manager/     # @trading-model/address-manager
│   └── broker-message/      # @trading-model/broker-message
├── services/           # Microservices
│   ├── message-manager/
│   ├── financial-scraper/
│   ├── trader-trainer/
│   ├── api-gateway/
│   ├── audit-logger/
│   ├── model-evaluator/
│   ├── risk-execution/
│   ├── decision-consumer/
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
| Database     | MongoDB (audit-logger, dlq-service), MySQL (financial-scraper), SQLite (SPIRE datastore, ADR-0065), Redis (message-manager subscriptions, dlq-service) |
| Validation   | Zod                                                  |
| Scheduling   | node-cron                                            |
| Formatting   | Biome                                                |
| Linting      | Biome                                                |

Layer boundaries (`application/` never imports `adapters/` or `infrastructure/`, except `index.ts`, `server.ts`, `telemetry.ts`; `domain/` imports neither `adapters/`, `infrastructure/`, `application/`, `config/` nor `express`, `ioredis`, `mongodb`, `mysql2`, `prom-client`: metrics reach `domain/` through an injected port, while a direct `config/metrics` import stays tolerated in `application/`) and the absence of runtime import cycles are enforced by `bun run arch:check`, ratcheted on `scripts/architecture-baseline.json` ([ADR-0015](../adr/0015-hexagonal-layering-completion.md)).

## Dependency Graph

The graph is not kept by hand: each `package.json` is the source. `bun run deps:check` verifies that `@trading-model/*` imports match the manifests (ADR-0016), `bun run arch:check` rejects runtime import cycles and layer violations, and the build order is in [AGENTS.md](../../AGENTS.md#build-order-dependency-chain).

> **Dependency direction:** `@trading-model/primitives` and `@trading-model/contracts` are the foundation layers and depend on nothing higher in the chain — they must never import `http` or any upper-layer package. `@trading-model/common` sits just above them and has **no** dependency on `@trading-model/http`. The concrete logger lives in `@trading-model/http`; `@trading-model/contracts` exposes a `LoggerPort` registry (`@trading-model/contracts/logger-registry`) that http populates at import time — breaking what was previously a real `common ↔ http` cycle.

Services and their `@trading-model/*` dependencies (the `dependencies` of each `package.json`, checked by `bun run deps:check`; the trader-trainer directory is the package `trader-trainer`):

| Service | Dependencies |
| --- | --- |
| api-gateway | common, contracts, http, primitives |
| audit-logger | address-manager, broker-message, common, contracts, http, persistence, primitives |
| dlq-service | address-manager, broker-message, common, contracts, crypto, http, persistence, primitives, reliability |
| model-evaluator | address-manager, broker-message, common, contracts, http, model-runtime, persistence, primitives |
| risk-execution | address-manager, broker-message, common, contracts, http, model-runtime, primitives |
| decision-consumer | address-manager, broker-message, common, contracts, http, model-runtime, primitives |
| financial-scraper | address-manager, common, contracts, crypto, http, persistence, primitives, reliability |
| message-manager | address-manager, broker-message, common, contracts, http, persistence, primitives, reliability |
| trader-trainer | address-manager, broker-message, common, contracts, crypto, http, model-runtime, persistence, primitives, reliability |

There is no frontend workspace: `admin-interface` was removed until a new one is specified ([ADR-0018](../adr/0018-temporary-frontend-removal.md)). A future frontend talks to the backend only through the **api-gateway**.

## Workload Identity & Security Model

- All service-to-service HTTP communication uses **HTTPS with mutual TLS** (mTLS); database client traffic is not encrypted (ADR-0060).
- Workload identity is provided by **SPIFFE/SPIRE** (ADR-0011): each workload is
  attested and issued short-lived X.509-SVIDs (with a `spiffe://` URI SAN),
  consumed via `spiffe-helper` sidecars. The former in-house CA and
  `certificate-client` were decommissioned.
- No service trusts another without explicit certificate/bundle validation.
- Live trading will be gated by risk limits, capital exposure constraints, and fail-safe mechanisms (planned).

## Service Conventions

### HTTPS Server with mTLS

Each service exposes an HTTPS server with mTLS enabled. The internal container port is always **3000**, with a unique host port mapping.

| Service           | Host port (dev) | Container port | Notes         |
| ----------------- | --------------- | -------------- | ------------- |
| message-manager   | 8444            | 3000           |               |
| financial-scraper | 8445            | 3000           |               |
| trader-trainer    | 8446            | 3000           |               |
| audit-logger      | 8450            | 3000           |               |
| dlq-service       | 8452            | 3000           |               |
| model-evaluator   | 8453            | 3000           |               |
| risk-execution    | 8454            | 3000           |               |
| decision-consumer | none            | 3000           | no host port  |
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
- **Ports**: type `XxxPort` (never an `I` prefix), file `xxx.port.ts` (never `-port.ts` / `.ports.ts`), located in `domain/ports/` (several ports of one concern may share a file; a small service may use a single `domain/ports.ts`). MySQL schemas: `xxx.schema.ts`.
- Containers take environment values **as parameters** (`createMessageManagerApp(ENV)`, `createScrapeScheduler(ENV)`) rather than importing `ENV`, so they can be imported by tests without environment validation.

### Entry Point (`src/application/index.ts`)

```typescript
import { createBootstrap } from '@trading-model/http/bootstrap';
import { createMessageManagerApp } from '../config/container';
import { ENV } from '../infrastructure/config/env';
import { createServer } from './server';

const { store, redisClient } = createMessageManagerApp(ENV);

createBootstrap({
  name: 'MessageManager',
  createServer: () => createServer(store),
  onStart: async () => {
    await redisClient?.connect();
  },
  onStop: () => {
    redisClient?.disconnect();
  },
});
```

### Server (`src/application/server.ts`)

```typescript
import { ServiceId } from '@trading-model/primitives/primitives';
import { createServiceServer } from '@trading-model/http/service-server-factory';
import { messageRoutes } from '../adapters/inbound/message.routes';
import { env } from '../config/env';

export function createServer() {
  return createServiceServer({
    env,
    serviceId: ServiceId.of('message-manager'),
    routes: app => {
      app.use('/', messageRoutes());
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

> Post-split (2026-10), `common` no longer exports `middleware/`, `worker/`, `recovery/`, `reliability/`, `domain/`, `crl/`, `persistence/`, `http-headers`, `http-status` or `contracts/`. Those live in `@trading-model/primitives`, `@trading-model/contracts`, `@trading-model/reliability`, `@trading-model/persistence` and `@trading-model/http` respectively (`worker/` and `recovery/` went to `@trading-model/jobs`, removed by ADR-0029). See the [package map](../services/common.md#package-map-post-split).

**@trading-model/crypto**, **@trading-model/address-manager** and **@trading-model/broker-message** (simplified exports):

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
