# Architecture — discovery-server

Central service registry providing dynamic service registration, TTL-based heartbeat liveness, token authentication, and instance discovery for a microservices platform.

## Project Structure

```
services/discovery-server/
├── src/
│   ├── app/
│   │   ├── index.ts              # Bootstrap: createBootstrap + LeaseManager lifecycle
│   │   └── server.ts             # Express HTTPS server via createSecureServer
│   ├── config/
│   │   └── env.ts                # Zod schema extended from BaseEnvSchema
│   ├── controllers/
│   │   ├── Register.controller.ts  # register, listServices, getServiceInstances, getInstance
│   │   ├── Heartbeat.controller.ts # heartbeat, rotateToken
│   │   └── helpers.ts             # asHandler, validateInstanceToken
│   ├── core/
│   │   ├── ServiceRegistry.ts     # In-memory registry (Map<serviceName, Map<instanceId, Instance>>)
│   │   ├── LeaseManager.ts        # Periodic cleanup of expired instances
│   │   └── types.ts               # Re-exports from @trading-model/common/contracts
│   └── routes/
│       ├── register.routes.ts     # POST /register, GET /services, GET /services/:name, GET /services/:name/:id
│       └── heartbeat.routes.ts    # POST /heartbeat, POST /token/rotate
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

| Layer | Files | Responsibility |
|---|---|---|
| **app/** | `index.ts`, `server.ts` | Application bootstrap, HTTPS server creation via `createBootstrap` / `createSecureServer` |
| **config/** | `env.ts` | Zod schema extending `BaseEnvSchema` with `CLEANUP_SERVICE_INTERVAL_MS` |
| **controllers/** | `Register.controller.ts`, `Heartbeat.controller.ts`, `helpers.ts` | HTTP request handling, input validation, auth token verification |
| **core/** | `ServiceRegistry.ts`, `LeaseManager.ts`, `types.ts` | Domain logic: registry CRUD, lease management, type exports |
| **routes/** | `register.routes.ts`, `heartbeat.routes.ts` | Thin Express Router definitions binding paths to controllers |

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

1. **mTLS transport** — all connections require valid client certificates signed by the shared Root CA
2. **Instance token** — each registration returns a HMAC-based token; sensitive operations (`/heartbeat`, `/token/rotate`) require the `x-instance-token` header

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | mTLS | Register or update a service instance |
| `GET` | `/services` | mTLS | List registered service names |
| `GET` | `/services/:serviceName` | mTLS | List instances for a service |
| `GET` | `/services/:serviceName/:instanceId` | mTLS | Get a specific instance |
| `POST` | `/heartbeat` | mTLS + token | Refresh instance lease TTL |
| `POST` | `/token/rotate` | mTLS + token | Rotate instance auth token |

## Testing Strategy

- **Unit tests** — pure logic (ServiceRegistry, LeaseManager.isAlive) or controller logic with mocked registry and middleware
- **Integration tests** — real ServiceRegistry + mocked external deps (logger, env), covering full registration → heartbeat → token rotation flows
- **Test helpers** — `createReq` / `createRes` / `createNext` for simplified Express mock objects
- **Coverage target** — 80%+ global
