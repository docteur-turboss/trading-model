# Architecture — discovery-server

Central service registry providing dynamic service registration, TTL-based heartbeat liveness, token authentication, and instance discovery for a microservices platform.

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
│   │   ├── service-registry.ts    # In-memory registry (Map<serviceName, Map<instanceId, Instance>>)
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
├── tests/
│   ├── fixtures/                  # Reusable test data
│   ├── helpers/                   # Test utilities
│   ├── unit/                      # Isolated unit tests
│   └── integration/               # Integration tests
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Layer Responsibilities

| Layer            | Files                                                             | Responsibility                                                                            |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **application/** | `index.ts`, `server.ts`                                           | Entry point, HTTPS server creation via `createBootstrap` / `createServiceServer`             |
| **adapters/**    | `inbound/registration-auth.ts`, `outbound/instance-store.ts`, `outbound/redis-instance-store.ts`, ... | Ports/adapters wiring: registration auth and instance persistence (in-memory / Redis) |
| **domain/**      | `service-registry.ts`, `lease-manager.ts`, `instance-token-manager.ts`, `ports/` | Domain logic: registry CRUD, lease management, tokens, ports/interfaces                |
| **infrastructure/** | `config/env.ts`, `monitoring/metrics.ts`                          | Env config, Prometheus metrics                                                          |
| **adapters/inbound/http/** | `register.controller.ts`, `heartbeat.controller.ts`, `register-builder.ts`, `*.routes.ts` | HTTP request handling, input validation, auth token verification; thin Express routers |
| **config/**      | `container.ts`                                                    | Composition root: `createDiscoveryApp(ENV)` (store, registry, lease manager) and `createServiceRegistry()` |

## Data Flow

```
Client (mTLS)
  │
  ▼
createSecureServer (Express + helmet + rate-limit)
  │
  ▼
Routes → Controllers → ServiceRegistry / LeaseManager
                           │
                           ▼
                      In-memory Map
```

## Key Design Decisions

### Shared infrastructure via @trading-model/common

- `createSecureServer` — HTTPS + mTLS Express server with helmet and rate limiting
- `createBootstrap` — lifecycle management (process signals, graceful shutdown)
- `BaseEnvSchema` + `validateEnv` — environment variable validation with Zod
- `catchSync`, `ResponseException` — error handling middleware
- `logger` — structured logging
- `isNonEmptyString`, `isObject`, `isValidIP`, `isValidPort` — input validators
- `generateRandomStr` — crypto token generation
- `ServiceInstance` and related types — shared DTOs

### In-memory storage

The registry uses a two-level `Map<string, Map<string, ServiceInstance>>`. No external database is required. This is suitable for controlled environments and can be replaced with Redis/etcd without changing the controller or route layer.

### TTL-based lease model

Each registered instance specifies a TTL. The `LeaseManager` runs periodically and evicts instances whose `lastHeartbeat + ttl < now`. Instances must send `POST /heartbeat` within the TTL window.

### Two-layer authentication

1. **mTLS transport** — all connections require valid client certificates; SVIDs signed by the SPIRE trust domain (ADR-0011)
2. **Instance token** — each registration returns a HMAC-based token; sensitive operations (`/heartbeat`, `/token/rotate`) require the `x-instance-token` header

## API Endpoints

| Method | Path                                 | Auth         | Description                           |
| ------ | ------------------------------------ | ------------ | ------------------------------------- |
| `POST` | `/register`                          | mTLS         | Register or update a service instance |
| `GET`  | `/services`                          | mTLS         | List registered service names         |
| `GET`  | `/services/:serviceName`             | mTLS         | List instances for a service          |
| `GET`  | `/services/:serviceName/:instanceId` | mTLS         | Get a specific instance               |
| `POST` | `/heartbeat`                         | mTLS + token | Refresh instance lease TTL            |
| `POST` | `/token/rotate`                      | mTLS + token | Rotate instance auth token            |

## Testing Strategy

- **Unit tests** — pure logic (ServiceRegistry, LeaseManager.isAlive) or controller logic with mocked registry and middleware
- **Integration tests** — real ServiceRegistry + mocked external deps (logger, env), covering full registration → heartbeat → token rotation flows
- **Test helpers** — `createReq` / `createRes` / `createNext` for simplified Express mock objects
- **Coverage target** — 80%+ global
