# @trading-model/address-manager

## Overview

**@trading-model/address-manager** is a client-side library for service discovery and lifecycle management. It handles registration with a central discovery server, mTLS-authenticated token management, TTL-based heartbeats, service instance caching with health-check pings, and periodic token/lease refresh via scheduled jobs.

Every microservice in the platform uses this package to register itself, discover peers, and maintain its lease.

## Dependencies

- `@trading-model/common` — HttpClient, middleware, error types
- `express` — Express `Router`, `Application` types
- `node-cron` — Scheduled job execution

## Endpoints

### Served (Inbound)

Mounted via `listenExpress(app)`:

| Method | Path | Handler | Description |
|---|---|---|---|
| GET | `/ping` | `pingController` | Health-check endpoint. Returns `"pong"` with status 200. |

### Consumed (Outbound)

Calls made to the Discovery Server:

| Method | Path | Source | Purpose |
|---|---|---|---|
| POST | `{addressManagerUrl}/services/register` | `AddressManagerClient` | Register this service instance |
| POST | `{addressManagerUrl}/services/ttl/refresh` | `AddressManagerClient` | Refresh service lease TTL (Bearer token auth) |
| POST | `{addressManagerUrl}/token/rotate` | `TokenManager` | Rotate authentication token |
| GET | `{addressManagerUrl}/services/{serviceName}` | `ServiceDiscovery` | Fetch a specific service instance |
| GET | `http://{ip}:{port}/ping` | `ServiceHealthChecker` | Health-check a discovered service |

## Exports

### Default Export — AddressManager Client Class

```typescript
import AddressManager from "@trading-model/address-manager";

const am = new AddressManager({
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
});
```

**Methods:**

| Method | Signature | Description |
|---|---|---|
| `am.listenExpress(app)` | `(app: Application) => void` | Mounts `GET /ping` health-check route |
| `am.start()` | `() => { stop: () => void }` | Registers service, starts token + TTL refresh schedulers |
| `am.getToken()` | `() => string` | Returns current auth token (throws if not set) |
| `am.findService(name)` | `(name: string) => Promise<ServiceInstance>` | Finds a healthy service instance (cache → ping → fetch) |

### Named Types

| Export | File | Description |
|---|---|---|
| `AddressManagerConfig` | `config/AddressManagerConfig.ts` | Configuration interface for the constructor |
| `RegisterServicePayload` | `client/type.ts` | `{ name: string; port: number }` |
| `ServiceInstance` | `client/type.ts` | Full service descriptor: `protocol, lastHeartbeat, registeredAt, serviceName, instanceId, port, env?, ttl, ip` |
| `ServiceRegistrationResponse` | `client/type.ts` | Extends `ServiceInstance` with `token: string` |
| `CacheEntry` | `discovery/type.ts` | Internal cache entry: `{ instance, expiresAt }` |

### Internal Classes (not directly exported)

| Class | File | Description |
|---|---|---|
| `TokenManager` | `client/tokenManager.ts` | In-memory token storage, refresh via `POST /token/rotate` |
| `AddressManagerClient` | `client/addressManagerClient.ts` | HTTP client for Discovery Server API (register, refresh TTL) |
| `ServiceCache` | `discovery/serviceCache.ts` | In-memory cache with TTL expiry for service instances |
| `ServiceHealthChecker` | `discovery/serviceHealthChecker.ts` | Pings `http://{ip}:{port}/ping` to verify liveness |
| `ServiceDiscovery` | `discovery/serviceDiscovery.ts` | Orchestrates cache → health check → fetch flow |
| `Scheduler` | `scheduler/scheduler.ts` | Generic `node-cron` scheduler |
| `ScheduledJob` | `scheduler/scheduler.ts` | Interface: `{ schedule: string; execute(): Promise<void> }` |
| `TokenRefresherJob` | `scheduler/tokenRefreshJob.ts` | Periodically calls `TokenManager.refreshToken()` |
| `TtlRefresherJob` | `scheduler/ttlRefresherJob.ts` | Periodically calls `AddressManagerClient.refreshTTL()` |

## How to Use

### Basic Setup

```typescript
import AddressManager from "@trading-model/address-manager";
import express from "express";

const app = express();

const am = new AddressManager({
  instanceId: process.env.INSTANCE_ID || "instance-1",
  serviceName: process.env.SERVICE_NAME || "MyService",
  servicePort: Number(process.env.PORT) || 3000,
  addressManagerUrl: process.env.ADDRESS_MANAGER_URL!,
  tokenRefreshIntervalMs: 300000,  // 5 min
  ttlRefreshIntervalMs: 300000,    // 5 min
  servicePingTimeoutMs: 2000,      // 2 sec
  RootCACertPath: "/etc/certs/ca.pem",
  CertificatPath: "/etc/certs/cert.pem",
  KeyCertificatPath: "/etc/certs/key.pem",
  cacheTtlMs: 60000,               // 1 min
});

// Mount health check
am.listenExpress(app);

// Start registration and background jobs
const { stop } = am.start();

// Discover another service
const instance = await am.findService("financial-scrapper-service");
console.log(`Found at ${instance.ip}:${instance.port}`);

// Get current auth token
const token = am.getToken();

// Graceful shutdown
stop();
```

### Lifecycle

1. **Constructor**: Creates HttpClient (mTLS), TokenManager, AddressManagerClient, ServiceCache, ServiceHealthChecker, ServiceDiscovery
2. **`am.start()`**: Registers with Discovery Server via `POST /services/register`, starts `TokenRefresherJob` and `TtlRefresherJob` on a cron schedule
3. **`am.findService(name)`**: Checks local cache, pings cached instance if found, falls back to `GET /services/{name}` from Discovery Server, caches and returns healthy instance
4. **`stop()`**: Stops all scheduled cron jobs

## Deployment

This package is built as a workspace dependency. Consuming services reference it in their `package.json`:

```json
"dependencies": { "@trading-model/address-manager": "*" }
```

Build: `npm run build` (tsc). The compiled output goes to `dist/`.
