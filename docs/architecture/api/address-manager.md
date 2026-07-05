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
  discoveryUrls: string[];
  localDiscoveryUrl?: string;
  region?: string;
  publicIp?: string;
  tokenRefreshIntervalMs: number;
  ttlRefreshIntervalMs: number;
  servicePingTimeoutMs: number;
  discoveryTimeoutMs: number;
  rootCACertPath: string;
  certificatePath: string;
  keyCertificatePath: string;
  cacheTtlMs: number;
  dnsNameMap?: Record<string, string>;
  metricsIntervalMs?: number;
  wsUrl?: string;
  wsSubscribedServices?: string[];
  maxCallRecords?: number;
  preferredNetworkInterface?: string;
  pems?: { ca: string; cert: string; key: string };
  redisCacheUrl?: string;
  redisCacheOptions?: Record<string, unknown>;
  circuitBreakerFailureThreshold?: number;
  circuitBreakerHalfOpenTimeoutMs?: number;
  circuitBreakerCacheTtlMs?: number;
  circuitBreakerLatencyWindowSize?: number;
  circuitBreakerLatencyThresholdMs?: number;
}
```

| Field                    | Type                     | Default | Description                                                                      |
| ------------------------ | ------------------------ | ------- | -------------------------------------------------------------------------------- |
| `instanceId`             | `string`                 | —       | Unique identifier for this service instance                                      |
| `serviceName`            | `string`                 | —       | Logical service name (e.g. `financial-scraper-service`)                          |
| `servicePort`            | `number`                 | —       | Port the service listens on                                                      |
| `addressManagerUrl`      | `string`                 | —       | Discovery-server base URL                                                        |
| `tokenRefreshIntervalMs` | `number`                 | `60000` | Token rotation interval                                                          |
| `ttlRefreshIntervalMs`   | `number`                 | `15000` | TTL refresh interval                                                             |
| `servicePingTimeoutMs`   | `number`                 | `2000`  | Health check timeout                                                             |
| `rootCACertPath`         | `string`                 | —       | Path to root CA certificate for mTLS                                             |
| `certificatePath`        | `string`                 | —       | Path to client certificate for mTLS                                              |
| `keyCertificatePath`     | `string`                 | —       | Path to client private key for mTLS                                              |
| `cacheTtlMs`             | `number`                 | `30000` | TTL for cached service instances                                                 |
| `dnsNameMap`             | `Record<string, string>` | —       | Optional mapping from logical service names to deployment-specific DNS hostnames |
| `discoveryUrls`          | `string[]`               | —       | Ordered list of discovery URLs for multi-region failover                         |
| `region`                 | `string`                 | —       | Deployment region / datacenter identifier                                        |
| `publicIp`               | `string`                 | —       | Override for auto-detected public IP                                             |
| `discoveryTimeoutMs`     | `number`                 | `5000`  | Discovery HTTP call timeout                                                      |

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
  lastHeartbeat: number;
  registeredAt: number;
  serviceName: string;
  instanceId: string;
  env?: string;
  ttl: number;
  version: string;
  region?: string;
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
3. Registration retries with exponential backoff (1s base, 30s cap, up to 10 attempts) if the discovery-server is unreachable; errors are logged at each attempt
4. Registration aborts early if `stop()` is called during retry

### TTL Refresh

- Configurable interval: `ttlRefreshIntervalMs` (default 15s)
- Sends `POST /heartbeat` with the token to extend the lease

### Token Refresh

- Configurable interval: `tokenRefreshIntervalMs` (default 60s)
- Sends `POST /token/rotate` with the mTLS certificate

### Health Check

- Pings discovered services with `servicePingTimeoutMs` (default 2000ms)
- Only healthy services are returned by `findService()`
- Target hostname resolution is delegated to a `ServiceLocator` strategy, decoupling the health checker from any specific deployment topology (Docker Compose, Kubernetes, standalone)

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
| GET    | `https://{host}:{port}/ping`                 | `ServiceHealthChecker` | Health-check a discovered service             |

## Sub-path Exports

In addition to the default export, the package exposes internal modules via deep imports:

| Import Path                                                       | Exports                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `@trading-model/address-manager/discovery/service-locator`        | `ServiceLocator`, `ServiceNameLocator`, `IpAddressLocator`, `MappingServiceLocator` |
| `@trading-model/address-manager/discovery/service-health-checker` | `ServiceHealthChecker`                                                              |
| `@trading-model/address-manager/discovery/service-cache`          | `ServiceCache`                                                                      |
| `@trading-model/address-manager/discovery/service-discovery`      | `ServiceDiscovery`                                                                  |
| `@trading-model/address-manager/client/token-manager`             | `TokenManager`                                                                      |
| `@trading-model/address-manager/client/address-manager-client`    | `AddressManagerClient`                                                              |
| `@trading-model/address-manager/client/type`                      | `ServiceInstance`, `RegisterServicePayload`, `ServiceRegistrationResponse`          |
| `@trading-model/address-manager/scheduler/scheduler`              | `Scheduler`                                                                         |
| `@trading-model/address-manager/scheduler/refresh-job`            | `RefreshJob`                                                                        |
| `@trading-model/address-manager/scheduler/cron.util`              | `intervalMsToCron` (sub-minute cron support via 6-field seconds format)             |
| `@trading-model/address-manager/config/address-manager-config`    | `AddressManagerConfig`                                                              |

## Environment Schema

- **Import**: `@trading-model/common/validation/env`
- **Schema**: `AddressManagerEnvSchema`

| Variable                          | Default     | Description                 |
| --------------------------------- | ----------- | --------------------------- |
| `APP_NAME`                        | —           | Application name            |
| `APP_VERSION`                     | `'1.0.0'`   | Version                     |
| `SERVICE_NAME`                    | —           | Service identifier          |
| `INSTANCE_ID`                     | —           | Instance UUID               |
| `CACHE_TTL_MS`                    | `30000`     | Discovery cache TTL         |
| `DISCOVERY_TIMEOUT_MS`            | `5000`      | Discovery HTTP call timeout |
| `SERVICE_PING_TIMEOUT_MS`         | `2000`      | Health check timeout        |
| `TOKEN_REFRESH_INTERVAL_MS`       | `60000`     | Token rotation interval     |
| `TTL_REFRESH_INTERVAL_MS`         | `15000`     | TTL refresh interval        |
| `ADDRESS_MANAGER_URL`             | —           | Discovery-server URL        |
| `DNS_NAME_MAP`                    | `'{}'`      | Custom DNS mapping (JSON)   |
| `ADDRESS_MANAGER_URLS`            | —           | Optional JSON array of discovery URLs for multi-region failover |
| `REGION`                          | —           | Deployment region identifier |
| `ERROR_URL_WEBHOOK`               | `''`        | Error webhook               |
| `MESSAGE_BUS_INIT_TIMEOUT_MS`     | `2000`      | Bus init timeout            |
| `MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS` | `2000`      | Bus shutdown timeout        |
| `MESSAGE_CALLBACK_PATH`           | `'message'` | Message callback path       |

## Internal Architecture

```
AddressManagerConfig → HttpClient (mTLS)
                     → TokenManager
                     → AddressManagerClient (registration)
                     → ServiceDiscovery
                        → ServiceCache (TTL cache)
                         → ServiceHealthChecker
                            → ServiceLocator (strategy)
                               → ServiceNameLocator (default — service name)
                               → IpAddressLocator (direct IP)
                               → MappingServiceLocator (config-driven via DnsResolver)
                     → Scheduler
                        → RefreshJob<TokenManager>
                        → RefreshJob<AddressManagerClient>
```

## Target Resolution

The `ServiceHealthChecker` delegates hostname resolution to a pluggable `ServiceLocator` strategy, decoupling health-check URL construction from any specific deployment topology.

### ServiceLocator

```ts
interface ServiceLocator {
  locate(instance: ServiceInstance): string;
}
```

A strategy interface that determines the target hostname for a given service instance. Receives the full `ServiceInstance` object, giving implementations access to `ip`, `port`, `serviceName`, and other metadata.

### ServiceNameLocator

```ts
class ServiceNameLocator implements ServiceLocator {
  locate(instance: ServiceInstance): string;
}
```

Default locator that returns `instance.serviceName` as the hostname. Suitable for environments where logical service names are already DNS-resolvable (e.g. Docker Compose).

### IpAddressLocator

```ts
class IpAddressLocator implements ServiceLocator {
  locate(instance: ServiceInstance): string;
}
```

Locator that uses `instance.ip` directly. Suitable for environments with direct IP connectivity where DNS-based service names are unavailable.

### MappingServiceLocator

```ts
class MappingServiceLocator implements ServiceLocator {
  constructor(private readonly dnsResolver: DnsResolver) {}
  locate(instance: ServiceInstance): string;
}
```

Locator that delegates to an internal `DnsResolver` strategy for name-based mapping. The `DnsResolver` interface and its implementations (`IdentityResolver`, `MapResolver`) remain as internal utilities. When `dnsNameMap` config is provided, an `AddressManager` creates `new MappingServiceLocator(new MapResolver(dnsNameMap))`. The `DnsResolver` is loaded from the `dnsNameMap` config field (populated by the `DNS_NAME_MAP` environment variable).

## Internal Classes

| Class                   | Description                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TokenManager`          | In-memory token storage, refresh via `POST /token/rotate`                                                                                                    |
| `AddressManagerClient`  | HTTP client for Discovery Server API (register, refresh TTL). Wraps errors in `AddressManagerError` with original error preserved in `cause` property.       |
| `ServiceCache`          | In-memory cache with TTL expiry for service instances                                                                                                        |
| `ServiceHealthChecker`  | Pings `https://{host}:{port}/ping` to verify liveness. Target resolution delegated to a `ServiceLocator` strategy.                                           |
| `ServiceLocator`        | Strategy interface for determining the target hostname of a service instance.                                                                                |
| `ServiceNameLocator`    | Default `ServiceLocator` that uses `instance.serviceName` as the hostname.                                                                                   |
| `IpAddressLocator`      | `ServiceLocator` that uses `instance.ip` directly.                                                                                                           |
| `MappingServiceLocator` | `ServiceLocator` backed by an internal `DnsResolver` (loaded from `dnsNameMap` config / `DNS_NAME_MAP` env var).                                             |
| `ServiceDiscovery`      | Orchestrates cache → health check → fetch flow. Uses configurable `discoveryTimeoutMs` for HTTP calls to prevent indefinite hangs.                           |
| `Scheduler`             | Generic `node-cron` scheduler. Logs job execution errors via `logger.error` instead of swallowing them.                                                      |
| `RefreshJob<T>`         | Parameterized job that calls a configurable refresh function on a client instance. Replaces previously duplicated `TokenRefresherJob` and `TtlRefresherJob`. |

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

### DNS Name Mapping Example

```typescript
import AddressManager from '@trading-model/address-manager';

const am = new AddressManager({
  // ...
  dnsNameMap: {
    'discovery-service': 'discovery-server',
    'financial-scraper-service': 'scraper',
    'message-delivery-service': 'msg-svc',
  },
});
```

## Deployment

This package is built as a workspace dependency. Consuming services reference it in their `package.json`:

```json
"dependencies": { "@trading-model/address-manager": "*" }
```

Build: `npm run build` (tsc, CommonJS output). The compiled output goes to `dist/`.
