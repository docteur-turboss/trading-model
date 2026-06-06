# @trading-model/address-manager — Address Manager & Service Discovery

Client-side library for service registration and discovery with the **discovery-server**.

## Overview

**@trading-model/address-manager** handles registration with a central discovery server, mTLS-authenticated token management, TTL-based heartbeats, service instance caching with health-check pings, and periodic token/lease refresh via scheduled jobs.

Every microservice in the platform uses this package to register itself, discover peers, and maintain its lease.

## Dependencies

- `@trading-model/common` — HttpClient, middleware, error types
- `express` — Express `Router`, `Application` types
- `node-cron` — Scheduled job execution

## Main Class

- **Import**: `@trading-model/address-manager`
- **Default export**: class `AddressManager`

```ts
import AddressManager from '@trading-model/address-manager';
```

### Constructor

```ts
constructor(config: AddressManagerConfig)
```

### AddressManagerConfig

```ts
interface AddressManagerConfig {
  instanceId: string;
  serviceName: string;
  servicePort: number;
  addressManagerUrl: string;
  tokenRefreshIntervalMs: number;
  ttlRefreshIntervalMs: number;
  servicePingTimeoutMs: number;
  RootCACertPath: string;
  CertificatPath: string;
  KeyCertificatPath: string;
  cacheTtlMs: number;
  dnsNameMap?: Record<string, string>;
}
```

### Public Methods

| Method               | Signature                                           | Description                                              |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `start()`            | `() => { stop: () => void }`                        | Starts registration, TTL refresh, and token rotation     |
| `stop()`             | (via handle returned by start)                      | Stops all periodic cycles                                |
| `findService(name)`  | `(serviceName: string) => Promise<ServiceInstance>` | Resolves a service by name (with cache and health check) |
| `getToken()`         | `() => string`                                      | Returns the current auth token                           |
| `listenExpress(app)` | `(app: Application) => void`                        | Mounts health check routes (ping)                        |

### ServiceInstance

```ts
interface ServiceInstance {
  ip: string;
  port: number;
  protocol: string;
  lastHeartbeat: string;
  registeredAt: string;
  serviceName: string;
  instanceId: string;
  env?: string;
  ttl: number;
}
```

## Factory

```ts
import { createAddressManager } from '@trading-model/address-manager';
```

`createAddressManager(env)` creates an instance from validated environment variables (uses `AddressManagerEnvSchema`).

## Lifecycle

### Registration

1. `start()` → registers the service via `POST /register` on the discovery-server
2. The received token is stored in the `TokenManager`

### TTL Refresh

- Configurable interval: `ttlRefreshIntervalMs` (default 15s)
- Sends `POST /heartbeat` with the token to extend the lease

### Token Refresh

- Configurable interval: `tokenRefreshIntervalMs` (default 60s)
- Sends `POST /token/rotate` with the mTLS certificate

### Health Check

- Pings discovered services with `servicePingTimeoutMs` (default 2000ms)
- Only healthy services are returned by `findService()`

## Endpoints

### Served (Inbound)

Mounted via `listenExpress(app)`:

| Method | Path    | Handler          | Description                                              |
| ------ | ------- | ---------------- | -------------------------------------------------------- |
| GET    | `/ping` | `pingController` | Health-check endpoint. Returns `"pong"` with status 200. |

### Consumed (Outbound)

Calls made to the Discovery Server:

| Method | Path                                         | Source                 | Purpose                                       |
| ------ | -------------------------------------------- | ---------------------- | --------------------------------------------- |
| POST   | `{addressManagerUrl}/services/register`      | `AddressManagerClient` | Register this service instance                |
| POST   | `{addressManagerUrl}/services/ttl/refresh`   | `AddressManagerClient` | Refresh service lease TTL (Bearer token auth) |
| POST   | `{addressManagerUrl}/token/rotate`           | `TokenManager`         | Rotate authentication token                   |
| GET    | `{addressManagerUrl}/services/{serviceName}` | `ServiceDiscovery`     | Fetch a specific service instance             |
| GET    | `http://{ip}:{port}/ping`                    | `ServiceHealthChecker` | Health-check a discovered service             |

## Environment Schema

- **Import**: `@trading-model/common/validation/env`
- **Schema**: `AddressManagerEnvSchema`

| Variable                          | Default     | Description             |
| --------------------------------- | ----------- | ----------------------- |
| `APP_NAME`                        | —           | Application name        |
| `APP_VERSION`                     | `'1.0.0'`   | Version                 |
| `SERVICE_NAME`                    | —           | Service identifier      |
| `INSTANCE_ID`                     | —           | Instance UUID           |
| `CACHE_TTL_MS`                    | `30000`     | Discovery cache TTL     |
| `SERVICE_PING_TIMEOUT_MS`         | `2000`      | Health check timeout    |
| `TOKEN_REFRESH_INTERVAL_MS`       | `60000`     | Token rotation interval |
| `TTL_REFRESH_INTERVAL_MS`         | `15000`     | TTL refresh interval    |
| `ADDRESS_MANAGER_URL`             | —           | Discovery-server URL    |
| `DNS_NAME_MAP`                    | `'{}'`      | Custom DNS mapping (JSON) |
| `ERROR_URL_WEBHOOK`               | `''`        | Error webhook           |
| `MESSAGE_BUS_INIT_TIMEOUT_MS`     | `2000`      | Bus init timeout        |
| `MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS` | `2000`      | Bus shutdown timeout    |
| `MESSAGE_CALLBACK_PATH`           | `'message'` | Message callback path   |

## Internal Architecture

```
AddressManagerConfig → HttpClient (mTLS)
                     → TokenManager
                     → AddressManagerClient (registration)
                     → ServiceDiscovery
                        → ServiceCache (TTL cache)
                        → ServiceHealthChecker
                     → Scheduler
                        → TokenRefresherJob
                        → TtlRefresherJob
```

## Internal Classes

| Class                  | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `TokenManager`         | In-memory token storage, refresh via `POST /token/rotate`    |
| `AddressManagerClient` | HTTP client for Discovery Server API (register, refresh TTL) |
| `ServiceCache`         | In-memory cache with TTL expiry for service instances        |
| `ServiceHealthChecker` | Pings `http://{ip}:{port}/ping` to verify liveness           |
| `ServiceDiscovery`     | Orchestrates cache → health check → fetch flow               |
| `Scheduler`            | Generic `node-cron` scheduler                                |
| `TokenRefresherJob`    | Periodically calls `TokenManager.refreshToken()`             |
| `TtlRefresherJob`      | Periodically calls `AddressManagerClient.refreshTTL()`       |

## Usage Example

```typescript
import AddressManager from '@trading-model/address-manager';
import express from 'express';

const app = express();

const am = new AddressManager({
  instanceId: process.env.INSTANCE_ID || 'instance-1',
  serviceName: process.env.SERVICE_NAME || 'MyService',
  servicePort: Number(process.env.PORT) || 3000,
  addressManagerUrl: process.env.ADDRESS_MANAGER_URL!,
  tokenRefreshIntervalMs: 300000, // 5 min
  ttlRefreshIntervalMs: 300000, // 5 min
  servicePingTimeoutMs: 2000, // 2 sec
  RootCACertPath: '/etc/certs/ca.pem',
  CertificatPath: '/etc/certs/cert.pem',
  KeyCertificatPath: '/etc/certs/key.pem',
  cacheTtlMs: 60000, // 1 min
});

am.listenExpress(app);
const { stop } = am.start();

const instance = await am.findService('financial-scraper-service');
console.log(`Found at ${instance.ip}:${instance.port}`);

const token = am.getToken();
stop();
```

## Deployment

This package is built as a workspace dependency. Consuming services reference it in their `package.json`:

```json
"dependencies": { "@trading-model/address-manager": "*" }
```

Build: `npm run build` (tsc, CommonJS output). The compiled output goes to `dist/`.
