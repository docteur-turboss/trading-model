# discovery-server — Service Discovery

Centralised service instance registry with TTL-based lease management and HMAC-SHA256 token authentication.

## General Information

| Property         | Value                                   |
| ---------------- | --------------------------------------- |
| Service name     | `discovery-service`                     |
| Port (host)      | `8443`                                  |
| Port (container) | `3000`                                  |
| Dependencies     | `@trading-model/common` only            |
| TLS              | mTLS required (client certificate)      |
| Storage          | In-memory with TTL-based lease eviction |

## REST Endpoints

### Register Service

**`POST /register`**

Registers or updates a service instance. Requires a valid TLS client certificate.

- Idempotent by `(serviceName + instanceId)`
- Returns an HMAC-SHA256 token for the instance
- Initialises TTL and heartbeat metadata

**Request Body:**

```json
{
  "name": "financial-scraper-service",
  "version": "1.0.0",
  "host": "192.168.1.10",
  "port": 3000,
  "healthEndpoint": "/ping"
}
```

**Response:** `201 Created`

```json
{
  "id": "svc-abc-123",
  "token": "hmac-sha256-token-value",
  "ttl": 15000
}
```

### Heartbeat

**`POST /heartbeat`**

Extends the TTL (lease) of a service instance. Called periodically by each service via the AddressManager client.

**Request Body:**

```json
{
  "serviceName": "financial-scraper-service",
  "instanceId": "uuid-instance-id",
  "authToken": "hmac-sha256-token-value"
}
```

**Response:** `200 OK`

```json
{
  "status": "ok",
  "ttl": 15000
}
```

### Token Rotation

**`POST /token/rotate`**

Rotates the HMAC-SHA256 authentication token for a service instance. Requires mTLS client certificate.

**Response:** `200 OK`

```json
{
  "token": "new-hmac-sha256-token"
}
```

### Get All Services

**`GET /services`**

Lists all registered service names.

**Response:** `200 OK`

```json
[
  {
    "id": "svc-abc-123",
    "name": "financial-scraper-service",
    "host": "192.168.1.10",
    "port": 3000
  },
  {
    "id": "svc-def-456",
    "name": "trader-training-service",
    "host": "192.168.1.11",
    "port": 3000
  }
]
```

### Get Services by Name

**`GET /services/:serviceName`**

Lists all instances of a given service.

**Response:** `200 OK`

```json
[
  {
    "serviceName": "financial-scraper-service",
    "instanceId": "uuid-instance-id",
    "ip": "192.168.1.10",
    "port": 3000,
    "protocol": "https",
    "lastHeartbeat": "2025-01-15T10:30:00Z",
    "registeredAt": "2025-01-15T10:00:00Z",
    "ttl": 15000
  }
]
```

### Get Instance Details

**`GET /services/:serviceName/:instanceId`**

Returns detailed metadata for a specific service instance.

**Response:** `200 OK`

```json
{
  "serviceName": "financial-scraper-service",
  "instanceId": "uuid-instance-id",
  "ip": "192.168.1.10",
  "port": 3000,
  "protocol": "https",
  "lastHeartbeat": "2025-01-15T10:30:00Z",
  "registeredAt": "2025-01-15T10:00:00Z",
  "ttl": 15000,
  "env": "production"
}
```

### Health Check

**`GET /ping`**

Health check endpoint (via `PING_PATH` constant).

**Response:** `200 OK`

```json
{
  "status": "ok"
}
```

## Architecture

The discovery-server follows a dependency injection pattern. No singletons are used — all components are explicitly wired together at the composition root.

### Core Classes

| Class / Factory                        | Instantiator   | Notes                                            |
| -------------------------------------- | -------------- | ------------------------------------------------ |
| `new ServiceRegistry()`                | `app/index.ts` | Central in-memory registry (no singleton export) |
| `new LeaseManager(registry, options?)` | `app/index.ts` | Accepts `ServiceRegistry` in constructor         |
| `createServer(registry)`               | `app/index.ts` | HTTPS server factory                             |

### Controller & Route Factories

All controllers and routes receive their dependencies via factory parameters:

| Factory                               | Returns                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `createRegisterController(registry)`  | `{ register, listServices, getServiceInstances, getInstance }` |
| `createHeartbeatController(registry)` | `{ heartbeat, rotateToken }`                                   |
| `registryRoutes(registry)`            | `Router`                                                       |
| `heartbeatRoutes(registry)`           | `Router`                                                       |

### Composition Root (`app/index.ts`)

```ts
const registry = new ServiceRegistry();
const leaseManager = new LeaseManager(registry, {
  cleanupIntervalMs: env.CLEANUP_SERVICE_INTERVAL_MS,
});
createBootstrap({
  createServer: () => createServer(registry),
  onStart: () => leaseManager.start(),
  onStop: () => leaseManager.stop(),
});
```

## LeaseManager

Manages leases and periodically cleans up expired instances. Accepts a `ServiceRegistry` instance in its constructor.

| Environment variable          | Default           | Description                       |
| ----------------------------- | ----------------- | --------------------------------- |
| `CLEANUP_SERVICE_INTERVAL_MS` | `600000` (10 min) | Expired instance cleanup interval |
| `ERROR_URL_WEBHOOK`           | _(none)_          | Webhook URL for error notifications |

Instances are automatically removed from the registry if their TTL expires without a heartbeat.

## Authentication

- **Token**: HMAC-SHA256, validated via the `x-instance-token` header
- **Transport**: mTLS (client certificate required for all endpoints except `/ping`)
- **Certificate**: validated by `MTLSAuthMiddleware` (CA chain + TLSv1.3)

## Controllers

Controllers are created via factories that accept a `ServiceRegistry` instance.

| File                         | Factory                     | Routes                                                                              |
| ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| `routes/register.routes.ts`  | `registryRoutes(registry)`  | `POST /register`, `GET /services`, `GET /services/:name`, `GET /services/:name/:id` |
| `routes/heartbeat.routes.ts` | `heartbeatRoutes(registry)` | `POST /heartbeat`, `POST /token/rotate`                                             |

## Deployment

The service is bootstrapped via `createBootstrap()` which attaches `SIGTERM`/`SIGINT` handlers. The composition root (`src/app/index.ts`) creates a `new ServiceRegistry()` and `new LeaseManager(registry)`, then passes the registry to `createServer(registry)`. The `LeaseManager` is started in `onStart` and stopped in `onStop`.
