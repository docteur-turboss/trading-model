# How to Add a New Service

This guide walks through creating a new microservice in the trading-model monorepo.

## Prerequisites
- Understanding of the [architecture conventions](../standards/architecture-standards.md)

- Familiarity with the [monorepo structure](../standards/architecture-standards.md#dependency-graph)
- Node.js and bun installed

## Directory Structure

Create `services/my-service/` with the standard layout:

```
services/my-service/
├── src/
│   ├── application/        # Entry point (index.ts), server, use-case orchestration
│   ├── domain/             # Entities, domain services, ports (interfaces)
│   ├── adapters/           # Driving/driven adapters
│   │   ├── inbound/        # Express controllers, route definitions
│   │   └── outbound/       # HTTP/WS clients to other services
│   ├── infrastructure/     # External integrations (Redis, MongoDB, HTTP)
│   ├── config/
│   │   └── env.ts          # Zod validation of environment variables
│   └── shared/             # Shared types, constants, utils
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── helpers/
├── docs/                  # Service-specific documentation
├── Dockerfile             # Multi-stage, oven/bun:1-alpine, tini
├── package.json
├── tsconfig.json
└── jest.config.js
```

## Package.json

```json
{
  "name": "my-service",
  "dependencies": {
    "@trading-model/common": "*",
    "@trading-model/validation": "*",
    "@trading-model/server-utils": "*",
    "@trading-model/address-manager": "*",
    "@trading-model/broker-message": "*",
    "express": "^5.2.1",
    "zod": "^4.4.3"
  }
}
```

## Entry Point (`src/application/index.ts`)

```typescript
import { createBootstrap } from '@trading-model/common/server/bootstrap';
import { createServer } from './server';
import '../config/env';

createBootstrap({
  name: 'MyService',
  createServer,
  onStart: () => {},
  onStop: () => {},
});
```

## HTTPS Server (`src/application/server.ts`)

```typescript
import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { myRoutes } from '../adapters/inbound/my.routes';
import { env } from '../config/env';

export function createServer() {
  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
    routes: app => {
      app.use('/', myRoutes());
    },
  });
}
```

## Dockerfile

All services follow the same multi-stage Docker pattern:

```dockerfile
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/ packages/
COPY services/ services/
RUN bun install --frozen-lockfile
RUN bun run build
WORKDIR /app/services/my-service
RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/my-service/package.json ./services/my-service/
COPY --from=build /app/services/my-service/dist ./services/my-service/dist
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "services/my-service/dist/application/index.js"]
```

## Registering in the Monorepo

1. Add the service to `docker-compose.yml` following the existing service pattern
2. Add a health check endpoint (`GET /ping`)
3. Register with the discovery-server using `@trading-model/address-manager`
4. Add documentation in `docs/services/my-service.md`
5. Reference the new service in `docs/services/README.md`

## Next Steps

- See [Service Documentation Template](../services/README.md) for documenting your service
- See [Deployment Guide](../deployment/DEPLOY.md) for deploying the new service
- See [CI/CD](../ci-cd/README.md) for adding the service to the pipeline
