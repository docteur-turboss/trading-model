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
├── Dockerfile             # Bun build stages, Node runtime pinned by digest, non-root, tini
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
import { createBootstrap } from '@trading-model/server-utils/application/services/bootstrap';
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
import { ServiceId } from '@trading-model/primitives/primitives';
import { createServiceServer } from '@trading-model/server-utils/adapters/inbound/service-server-factory';
import { myRoutes } from '../adapters/inbound/my.routes';
import { env } from '../config/env';

export function createServer() {
  return createServiceServer({
    env,
    serviceId: ServiceId.of('my-service'),
    routes: app => {
      app.use('/', myRoutes());
    },
  });
}
```

## Dockerfile

Copy `services/message-manager/Dockerfile` and replace `message-manager` with the service name. It builds with Bun but runs on Node (Bun exposes neither the peer certificate on HTTPS sockets nor `server.setSecureContext`, which SPIFFE caller identity and SVID rotation need), pins every base image by digest, runs as `appuser`, and probes `https://localhost:3000/health/ready` with the SVID as client certificate.

## Registering in the Monorepo

Each integration point below names what fails without it. Context: the "Docker Compose" and "CI/CD" sections of [`AGENTS.md`](../../AGENTS.md).

1. `main` (or `bin` for an operator CLI) in `package.json`, every `src` file reachable from it: `bun run reach:check`; `@trading-model/*` imports declared: `bun run deps:check`
2. Name in `ServiceInstanceName` (`packages/primitives/src/service-instance-name.ts`, read by the discovery registry through `ALL_SERVICE_NAMES`): `parseServiceName` refuses an unknown name, at runtime only; `PLATFORM_SERVICES` (`packages/common/src/config/workload-identity.ts`): `bun run api:check` (gateway paths)
3. Caller ACL in `packages/http/src/adapters/inbound/acl-config.ts` (`acl-config.spec.ts`); each service-to-service route has a caller in `CALLERS` of `scripts/api-contract.mjs`, a public route goes in `PUBLIC_ROUTES` of the gateway: `bun run api:check` (`bun run api:write` regenerates the OpenAPI)
4. `/metrics` route and a dependency-aware readiness check, service added to `SERVICES` of `scripts/observability-gate.mjs`: observability gate; scrape job in `observability/prometheus.yml` and `deploy/k8s/infra/prometheus.yaml` (no gate: check by hand)
5. Compose service with its `spiffe-helper-<x>` sidecar, SPIRE entry in `deploy/spire/bootstrap.sh` (K8s: `deploy/spire/k8s-entries.sh`), an `INSTANCE_ID`: CI E2E job (`up --wait` fails without them); ports on `127.0.0.1`: `bun run compose-ports:check`; the `x-logging` anchor and an `INSTANCE_ID` no other service shares: no check, verify by hand
6. K8s manifest in `deploy/k8s/services/` (listed in its `kustomization.yaml`) with `topologySpreadConstraints`, NetworkPolicy in `deploy/k8s/base/network-policies.yaml`, config in `deploy/k8s/config/<service>.properties`, image in `deploy.yml` `IMAGES` and the `release.yml` matrices: `node tests/k8s/check-overlays.mjs`, then the CI `k8s` job on kind
7. Every environment variable read by the code set by a deployment and documented in `docs/deployment/ENV.md`: `bun run config:check`
8. `docs/services/my-service.md`, referenced in `docs/services/README.md`

## Next Steps

- See [Service Documentation Template](../services/README.md) for documenting your service
- See [Deployment Guide](../deployment/DEPLOY.md) for deploying the new service
- See [CI/CD](../ci-cd/README.md) for adding the service to the pipeline
