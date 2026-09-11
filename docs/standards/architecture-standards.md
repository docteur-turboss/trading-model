# Architecture Standards

## Why

Ensure consistency, maintainability, and scalability across the entire trading-model monorepo. A standardized architecture enables every contributor to quickly understand the structure, add a new service or package without ambiguity, and guarantee interoperability between components.

## How

The project follows a monorepo structure with **bun workspaces**. All shared components live in `packages/` and all microservices in `services/`.

```
trading-model/
├── packages/           # Shared libraries (bun workspace)
│   ├── common/              # @trading-model/common
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
│   ├── dlq-service/
│   └── admin-interface/ # React SPA (Vite, MUI, Vitest)
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

> **See also:** [Bounded Contexts](../architecture/bounded-contexts.md) for DDD context maps, and [Database Schemas](../architecture/databases.md) for table definitions and entity types.

### Technology Stack

| Layer        | Technology                                           |
| ------------ | ---------------------------------------------------- |
| Runtime      | Node.js                                              |
| Language     | TypeScript (ES2020; module: node16 or commonjs)      |
| API          | Express.js                                           |
| Frontend SPA | React 19 + Vite + MUI 7 + Recharts + Vitest          |
| Security     | mTLS (all services)                                  |
| Database     | MongoDB (message-manager), MySQL (financial-scraper) |
| Validation   | Zod                                                  |
| Scheduling   | node-cron                                            |
| Formatting   | Biome                                                |
| Linting      | Biome                                                |

## Dependency Graph

```
@trading-model/common
    ↑
@trading-model/address-manager
    ↑
@trading-model/broker-message
    ↑
┌──────────────────────┬───────────────────┬──────────────────┬───────────────────┬───────────────────┐
│  message-manager     │ financial-scraper │ trader-trainer   │ audit-logger      │ dlq-service       │
│  (deps: common,      │ (deps: common,    │ (deps: common,   │ (deps: common,    │ (deps: common,    │
│   address-manager)   │  address-manager, │  address-manager,│  address-manager, │  address-manager, │
│                      │  broker-message)  │  broker-message) │  broker-message)  │  broker-message)  │
└──────────────────────┴───────────────────┴──────────────────┴───────────────────┴───────────────────┘
          ↑
discovery-server (depends only on @trading-model/common)

admin-interface (depends only on @trading-model/common/contracts for DTOs)
- React SPA served by nginx, not a Node.js microservice
```

The **discovery-server** depends only on `@trading-model/common`. All other services depend on `common`, `address-manager`, and `broker-message` as needed.

The **admin-interface** is a React SPA (not a Node.js microservice). It imports DTO types from `@trading-model/common/contracts/admin` and communicates with the backend exclusively via HTTP through the **api-gateway**. It is built with Vite, tested with Vitest, and served via nginx in production.

### Package Dependency Details

| Package                          | Purpose                                                                                                                                                                                                                                                                     | Dependencies            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `@trading-model/common`          | Logger, HTTP client, middleware (catchSync, MTLSAuthMiddleware, ResponseProtocol), server factories (createSecureServer, createBootstrap), env validation (BaseEnvSchema, validateEnv), event types, service types, delivery mode enum, error classes (`AppError` + `ErrorCodes`), crypto utilities, shared DTOs | None (only bun deps)    |
| `@trading-model/address-manager` | Service discovery client, token manager, service cache with health checking, scheduler/jobs                                                                                                                                                                                 | common                  |
| `@trading-model/broker-message`  | Inter-service messaging SDK: message manager client, event emitter, message controller/routes, validation schemas                                                                                                                                                           | common, address-manager |

## Workload Identity & Security Model

- All inter-service communication uses **HTTPS with mutual TLS** (mTLS).
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
| admin-interface   | 5173 (dev)      | 80             | SPA via nginx |
| api-gateway       | 8448            | 3000           |               |

### Service Structure

Services follow a hexagonal architecture (ADR-0010): business logic is isolated in `domain/` + `application/`, driven by `adapters/` (controllers, routes) and backed by `infrastructure/` (Redis, Mongo, HTTP clients). Legacy module layouts (`core/`, `messaging/`, `persistence/`) may still coexist in some services during migration.

```
services/<name>/
├── src/
│   ├── application/        # Entry point (index.ts), server, use-case orchestration
│   ├── domain/             # Entities, domain services, ports (interfaces)
│   ├── adapters/           # Driven/driving adapters (HTTP controllers, routes, clients)
│   │   ├── inbound/        # Express controllers, route definitions
│   │   └── outbound/       # HTTP/WS clients to other services
│   ├── infrastructure/     # External integrations (Redis, MongoDB, HTTP)
│   ├── config/             # env.ts — Zod validation of environment variables
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

### Entry Point (`src/application/index.ts`)

```typescript
import { createBootstrap } from '@trading-model/common/server/bootstrap';
import { LeaseManager } from '../domain/lease-manager';
import { createServer } from './server';
import '../config/env';

createBootstrap({
  name: 'Discovery',
  createServer,
  onStart: () => {
    LeaseManager.start();
  },
  onStop: () => {
    LeaseManager.stop();
  },
});
```

### Server (`src/application/server.ts`)

```typescript
import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { heartbeatRoutes } from '../adapters/inbound/heartbeat.routes';
import { registryRoutes } from '../adapters/inbound/register.routes';
import { env } from '../config/env';

export function createServer() {
  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
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

**@trading-model/common** (granular exports):

```json
{
  "exports": {
    "./config/*": { "types": "./dist/config/*.d.ts", "default": "./dist/config/*.js" },
    "./middleware/*": { "types": "./dist/middleware/*.d.ts", "default": "./dist/middleware/*.js" },
    "./utils/*": { "types": "./dist/utils/*.d.ts", "default": "./dist/utils/*.js" },
    "./server/*": { "types": "./dist/server/*.d.ts", "default": "./dist/server/*.js" },
    "./validation/*": { "types": "./dist/validation/*.d.ts", "default": "./dist/validation/*.js" },
    "./contracts/*": { "types": "./dist/contracts/*.d.ts", "default": "./dist/contracts/*.js" },
    "./crypto/*": { "types": "./dist/crypto/*.d.ts", "default": "./dist/crypto/*.js" },
    "./worker/*": { "types": "./dist/worker/*.d.ts", "default": "./dist/worker/*.js" },
    "./recovery/*": { "types": "./dist/recovery/*.d.ts", "default": "./dist/recovery/*.js" },
    "./reliability/*": { "types": "./dist/reliability/*.d.ts", "default": "./dist/reliability/*.js" }
  }
}
```

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

1. **Mixed test conventions**: Both `.spec.ts` and `.test.ts` suffixes used across services.
2. **Legacy `config/*` path alias**: Some service tsconfigs still define a `config/*` path alias (`./src/config/*`) that should be replaced with `node16` resolution.
