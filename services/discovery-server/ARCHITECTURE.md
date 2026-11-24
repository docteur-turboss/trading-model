# Architecture — discovery-server

Routes, authentication, storage, leases and composition root: [docs/services/discovery-server.md](../../docs/services/discovery-server.md). This file holds the source layout and the test approach.

## Project Structure

```
services/discovery-server/
├── src/
│   ├── application/
│   │   ├── index.ts              # Entry point: bootstrap + lifecycle (createBootstrap)
│   │   └── server.ts             # Express HTTPS server via createServiceServer
│   ├── adapters/
│   │   ├── inbound/
│   │   │   ├── http/                         # Controllers, routes (POST /register, GET /services[/:name[/:id]],
│   │   │   │                                 # POST /heartbeat, POST /token/rotate), register-builder
│   │   │   ├── registration-auth.ts          # mTLS + instance-token auth for registration
│   │   │   └── registration-ip-allowlist.ts  # IP allowlist for registration
│   │   └── outbound/
│   │       ├── instance-store.ts             # In-memory instance store
│   │       ├── redis-instance-store.ts       # Redis-backed instance store
│   │       ├── instance-registrar.ts
│   │       ├── instance-metadata-reader.ts
│   │       ├── instance-heartbeat-handler.ts
│   │       └── instance-cleanup-handler.ts
│   ├── domain/
│   │   ├── service-registry.ts    # Registry over the instance store port
│   │   ├── lease-manager.ts       # Periodic cleanup of expired instances
│   │   ├── stale-instance-cleaner.ts
│   │   ├── instance-token-manager.ts         # HMAC instance tokens
│   │   ├── expiration.ts
│   │   └── ports/                 # instance-store, discovery-metrics, token-crypto
│   ├── config/
│   │   └── container.ts           # createDiscoveryApp(ENV), createServiceRegistry(): store, crypto, metrics, lease manager
│   ├── infrastructure/
│   │   ├── config/env.ts          # Zod schema extended from BaseEnvSchema
│   │   └── monitoring/metrics.ts  # Prometheus collectors + prometheusDiscoveryMetrics port adapter
│   └── shared/                    # helpers, validators, redis-deps, redis-key-builder, types
├── tests/                         # fixtures/, helpers/, unit/, integration/
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Testing Strategy

- **Unit tests** — pure logic (ServiceRegistry, LeaseManager.isAlive) or controller logic with mocked registry and middleware
- **Integration tests** — real ServiceRegistry + mocked external deps (logger, env), covering full registration → heartbeat → token rotation flows
- **Test helpers** — `createReq` / `createRes` / `createNext` for simplified Express mock objects
