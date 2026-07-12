# How to Add a New Service

This guide walks through creating a new microservice in the trading-model monorepo.

## Prerequisites
- Understanding of the [architecture conventions](../standards/architecture-standards.md)

- Familiarity with the [monorepo structure](../standards/architecture-standards.md#dependency-graph)
- Node.js and npm installed

## Directory Structure

Create `services/my-service/` with the standard layout:

```
services/my-service/
├── src/
│   ├── app/
│   │   ├── index.ts        # Entry point (createBootstrap)
│   │   ├── server.ts       # HTTPS server with mTLS
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
├── Dockerfile             # Multi-stage, node:26-alpine, tini
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
    "@trading-model/address-manager": "*",
    "@trading-model/broker-message": "*",
    "express": "^5.2.1",
    "zod": "^4.4.3"
  }
}
```

## Entry Point (`src/app/index.ts`)

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

## HTTPS Server (`src/app/server.ts`)

```typescript
import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { myRoutes } from './routes/my.routes';
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
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/my-service/package.json services/my-service/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY services/my-service/ services/my-service/
RUN npm ci
RUN npm run build:common
WORKDIR /app/services/my-service
RUN npx tsc

FROM node:26-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini curl
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/my-service/package.json ./services/my-service/
COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/services/my-service/dist ./services/my-service/dist
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "services/my-service/dist/app/index.js"]
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
