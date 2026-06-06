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

**`POST /api/services/register`** or **`POST /register`**

Registers or updates a service instance. Requires a valid TLS client certificate.

- Idempotent by `(serviceName + instanceId)`
- Returns an HMAC-SHA256 token for the instance
- Initialises TTL and heartbeat metadata

**Request Body:**

```json
{
  "name": "financial-scrapper-service",
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

**`POST /api/services/heartbeat`** or **`POST /heartbeat`**

Extends the TTL (lease) of a service instance. Called periodically by each service via the AddressManager client.

**Request Body:**

```json
{
  "serviceName": "financial-scrapper-service",
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

**`GET /api/services`** or **`GET /services`**

Lists all registered service names.

**Response:** `200 OK`

```json
[
  {
    "id": "svc-abc-123",
    "name": "financial-scrapper-service",
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
    "serviceName": "financial-scrapper-service",
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
  "serviceName": "financial-scrapper-service",
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

## LeaseManager

Manages leases and periodically cleans up expired instances.

| Environment variable          | Default           | Description                       |
| ----------------------------- | ----------------- | --------------------------------- |
| `CLEANUP_SERVICE_INTERVAL_MS` | `600000` (10 min) | Expired instance cleanup interval |

Instances are automatically removed from the registry if their TTL expires without a heartbeat.

## Authentication

- **Token**: HMAC-SHA256, validated via the `x-instance-token` header
- **Transport**: mTLS (client certificate required for all endpoints except `/ping`)
- **Certificate**: validated by `MTLSAuthMiddleware` (CA chain + TLSv1.3)

## Controllers

| File                         | Routes                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `routes/register.routes.ts`  | `POST /register`, `GET /services`, `GET /services/:name`, `GET /services/:name/:id` |
| `routes/heartbeat.routes.ts` | `POST /heartbeat`, `POST /token/rotate`                                             |

## Deployment

The service is bootstrapped via `createBootstrap()` which attaches `SIGTERM`/`SIGINT` handlers. The `LeaseManager` is started in `onStart` and stopped in `onStop`.
