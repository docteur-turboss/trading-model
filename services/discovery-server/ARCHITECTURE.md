# Architecture — discovery-server

Central service registry providing dynamic service registration, TTL-based heartbeat liveness, token authentication, and instance discovery for a microservices platform.

## Project Structure

```
services/discovery-server/
├── src/
│   ├── application/
│   │   ├── index.ts              # Entry point: bootstrap + cache orchestrator + lifecycle
│   │   ├── server.ts             # Express HTTPS server via createSecureServer
│   │   ├── cached-registry-core.ts
│   │   ├── cached-registry-lifecycle.ts
│   │   ├── cache-orchestrator.ts
│   │   └── instance-cache-fetcher.ts
│   ├── adapters/
│   │   ├── inbound/
│   │   │   └── client-connection-manager.ts
│   │   └── outbound/
│   │       ├── redis-instance-store.ts
│   │       ├── instance-registrar.ts
│   │       ├── instance-metadata-reader.ts
│   │       ├── instance-heartbeat-handler.ts
│   │       └── instance-cleanup-handler.ts
│   ├── domain/
│   │   ├── service-registry.ts    # In-memory registry (Map<serviceName, Map<instanceId, Instance>>)
│   │   ├── lease-manager.ts       # Periodic cleanup of expired instances
│   │   ├── stale-instance-cleaner.ts
│   │   ├── heartbeat-throttle-manager.ts
│   │   ├── health-state-manager.ts
│   │   ├── instance-token-manager.ts
│   │   ├── expiration.ts
│   │   └── ports/
│   │       └── instance-store.interface.ts
│   ├── core/                      # WebSocket server wiring (ws-discovery-server, ws-message-dispatcher, ...)
│   ├── infrastructure/
│   │   ├── config/env.ts          # Zod schema extended from BaseEnvSchema
│   │   ├── redis-client-factory.ts
│   │   ├── redis-health-monitor.ts
│   │   ├── redis-backend-lifecycle.ts
│   │   ├── cache-manager.ts
│   │   ├── pub-sub-invalidator.ts
│   │   └── monitoring/metrics.ts
│   ├── controllers/
│   │   ├── register.controller.ts
│   │   ├── heartbeat.controller.ts
│   │   └── register-builder.ts
│   ├── routes/
│   │   ├── register.routes.ts     # POST /register, GET /services, GET /services/:name, GET /services/:name/:id
│   │   └── heartbeat.routes.ts    # POST /heartbeat, POST /token/rotate
│   └── shared/                    # helpers, validators, token-service, redis-deps, types
├── tests/
│   ├── fixtures/                  # Reusable test data
│   ├── helpers/                   # Test utilities
│   ├── unit/                      # Isolated unit tests
│   │   └── controllers/
│   └── integration/               # Integration tests
├── package.json
├── tsconfig.json
├── jest.config.ts
└── README.md
```

## Layer Responsibilities

| Layer            | Files                                                             | Responsibility                                                                            |
| ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **application/** | `index.ts`, `server.ts`, `cache-orchestrator.ts`, ...              | Entry point, HTTPS server creation via `createBootstrap` / `createSecureServer`, cache orchestration |
| **adapters/**    | `inbound/client-connection-manager.ts`, `outbound/redis-instance-store.ts`, ... | Ports/adapters wiring inbound WS clients and outbound Redis persistence |
| **domain/**      | `service-registry.ts`, `lease-manager.ts`, `ports/`               | Domain logic: registry CRUD, lease management, ports/interfaces                          |
| **core/**        | `ws-discovery-server.ts`, `ws-message-dispatcher.ts`, ...         | WebSocket protocol handling and connection setup                                         |
| **infrastructure/** | `config/env.ts`, `redis-client-factory.ts`, `cache-manager.ts`, ... | Env config, Redis clients, health monitoring, caching                                   |
| **controllers/** | `register.controller.ts`, `heartbeat.controller.ts`, `register-builder.ts` | HTTP request handling, input validation, auth token verification                          |
| **routes/**      | `register.routes.ts`, `heartbeat.routes.ts`                       | Thin Express Router definitions binding paths to controllers                              |

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
