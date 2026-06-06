# Architecture Standards

## Why

Ensure consistency, maintainability, and scalability across the entire trading-model monorepo. A standardized architecture enables every contributor to quickly understand the structure, add a new service or package without ambiguity, and guarantee interoperability between components.

## How

The project follows a monorepo structure with **npm workspaces**. All shared components live in `packages/` and all microservices in `services/`.

```
trading-model/
├── packages/           # Shared libraries (npm workspace)
│   ├── common/         # @trading-model/common
│   ├── address-manager/# @trading-model/address-manager
│   └── broker-message/ # @trading-model/broker-message
├── services/           # Microservices
│   ├── discovery-server/
│   ├── message-manager/
│   ├── financial-scraper/
│   └── trader-trainer/
├── .github/workflows/  # CI/CD
├── docs/               # Centralized documentation
├── scripts/            # Utilities (commit, release, certs)
└── eslint.config.mjs   # Root ESLint flat config
```

### Where

| Location      | Role                                        |
| ------------- | ------------------------------------------- |
| **Root**      | Shared config (ESLint, Prettier, tsconfig)  |
| **packages/** | Reusable libraries (public or internal)     |
| **services/** | Independently deployable microservices      |
| **docs/**     | Centralized project documentation           |
| **scripts/**  | Automation scripts (commit, release, certs) |

### For Whom

All developers contributing to the codebase. Every architectural decision aims to reduce onboarding time and eliminate structural ambiguity.

### Technology Stack

| Layer      | Technology                                           |
| ---------- | ---------------------------------------------------- |
| Runtime    | Node.js                                              |
| Language   | TypeScript (ES2020; module: node16 or commonjs)      |
| API        | Express.js                                           |
| Security   | mTLS (all services)                                  |
| Database   | MongoDB (message-manager), MySQL (financial-scraper) |
| Validation | Zod                                                  |
| Scheduling | node-cron                                            |
| Formatting | Prettier                                             |
| Linting    | ESLint 10 flat config                                |

## Dependency Graph

```
@trading-model/common
    ↑
@trading-model/address-manager
    ↑
@trading-model/broker-message
    ↑
┌──────────────────────┬───────────────────┬──────────────────┐
│  message-manager     │ financial-scraper │ trader-trainer   │
│  (deps: common,      │ (deps: common,    │ (deps: common,   │
│   address-manager)   │  address-manager, │  address-manager,│
│                      │  broker-message)  │  broker-message) │
└──────────────────────┴───────────────────┴──────────────────┘
          ↑
discovery-server (depends only on @trading-model/common)
```

The **discovery-server** depends only on `@trading-model/common`. All other services depend on `common`, `address-manager`, and `broker-message` as needed.

### Package Dependency Details

| Package                          | Purpose                                                                                                                                                                                                                                                                      | Dependencies            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `@trading-model/common`          | Logger, HTTP client, middleware (catchError, MTLSAuth, ResponseProtocole), server factories (createSecureServer, createBootstrap), env validation (BaseEnvSchema, validateEnv), event types, service types, delivery mode enum, error classes, crypto utilities, shared DTOs | None (only npm deps)    |
| `@trading-model/address-manager` | Service discovery client, token manager, service cache with health checking, scheduler/jobs                                                                                                                                                                                  | common                  |
| `@trading-model/broker-message`  | Inter-service messaging SDK: message manager client, event emitter, message controller/routes, validation schemas                                                                                                                                                            | common, address-manager |

## Security Model

- All inter-service communication uses **HTTPS with mutual TLS** (mTLS).
- No service trusts another without explicit certificate validation.
- The Discovery-Server issues and rotates HMAC tokens.
- Live trading will be gated by risk limits, capital exposure constraints, and fail-safe mechanisms (planned).

## Service Conventions

### HTTPS Server with mTLS

Each service exposes an HTTPS server with mTLS enabled. The internal container port is always **3000**, with a unique host port mapping.

| Service           | Host port (dev) | Container port |
| ----------------- | --------------- | -------------- |
| discovery-server  | 8443            | 3000           |
| message-manager   | 8444            | 3000           |
| financial-scraper | 8445            | 3000           |
| trader-trainer    | 8446            | 3000           |

### Service Structure

```
services/<name>/
├── src/
│   ├── app/
│   │   ├── index.ts        # Entry point (uses createBootstrap)
│   │   ├── server.ts       # Creates and configures the Express server
│   │   └── routes/         # Route definitions
│   ├── config/
│   │   ├── env.ts          # Zod validation of environment variables
│   │   └── constants.ts    # Service constants
│   ├── core/
│   │   ├── services/       # Business logic
│   │   ├── repositories/   # Data access
│   │   └── types/          # Domain types
│   ├── controllers/        # HTTP controllers
│   ├── middleware/         # Express middleware
│   └── utils/             # Utility functions
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/
│   └── helpers/
├── docs/                  # Service-specific documentation
├── Dockerfile
├── package.json
├── tsconfig.json
└── jest.config.js
```

### Entry Point (`src/app/index.ts`)

```typescript
import { createBootstrap } from '@trading-model/common/server/bootstrap';
import { LeaseManagerInstance } from '../core/lease-manager';
import { createServer } from './server';
import '../config/env';

createBootstrap({
  name: 'Discovery',
  createServer,
  onStart: () => {
    LeaseManagerInstance.start();
  },
  onStop: () => {
    LeaseManagerInstance.stop();
  },
});
```

### Server (`src/app/server.ts`)

```typescript
import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { heartbeatRoutes } from '../routes/heartbeat.routes';
import { registryRoutes } from '../routes/register.routes';
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
    "./crypto/*": { "types": "./dist/crypto/*.d.ts", "default": "./dist/crypto/*.js" }
  }
}
```

**@trading-model/address-manager** and **@trading-model/broker-message** (simplified exports):

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./*": { "types": "./dist/*.d.ts", "default": "./dist/*.js" }
  }
}
```

## Example: Adding a New Service

To add a new service `my-service`:

```
services/my-service/
├── src/
│   ├── app/
│   │   ├── index.ts        # createBootstrap({ name: 'MyService', createServer })
│   │   ├── server.ts       # createSecureServer({ port, tls, routes })
│   │   └── routes/
│   ├── config/
│   │   ├── env.ts          # Zod schema
│   │   └── constants.ts
│   ├── core/
│   │   └── services/
│   ├── controllers/
│   ├── middleware/
│   └── utils/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
├── Dockerfile              # Multi-stage, node:20-alpine, tini
├── package.json            # Depends on @trading-model/common and others as needed
├── tsconfig.json
└── jest.config.js
```

**package.json** (typical dependencies):

```json
{
  "name": "my-service",
  "dependencies": {
    "@trading-model/common": "*",
    "@trading-model/address-manager": "*",
    "@trading-model/broker-message": "*",
    "express": "^5.2.1",
    "zod": "^4.4.3"
  }
}
```

## Known Technical Debt

1. **Mixed test conventions**: Both `.spec.ts` and `.test.ts` suffixes used across services.
2. **Legacy `config/*` path alias**: Some service tsconfigs still define a `config/*` path alias (`./src/config/*`) that should be replaced with `node16` resolution.
3. **ESLint warnings**: ~50 lint errors remain across the codebase (unused variables, `any` types, empty interfaces, prefer-const).
