# @trading-model/http — HTTP Platform

Express middleware (mTLS identity and authorization, correlation id, ACL), response helpers, the outbound `HttpClient` and the concrete logging pipeline.

## Dependency rule

Depends on `primitives`, `contracts`, `common`, `reliability` (+ `express`, `zod`, `prom-client`, `helmet`, OpenTelemetry API and SDK). `validation` and `crypto` depend on it, so it must not import them.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/http/response-exception` | `ResponseException`, `sendResponse`, `HTTP_CODE` | Typed error responses |
| `@trading-model/http/logger` | `logger`, `createLogger`, `Logger`, `LogLevel` | Logger used by services (re-export shim, [ADR-0010](../adr/0010-clean-architecture-migration.md)) |
| `@trading-model/http/api-route/mount-route` | `mountRoute`, `ApiRouteHandler` | Declarative route mounting |
| `@trading-model/http/http-client` | `HttpClient` | mTLS client with retry and circuit breaker |
| `@trading-model/http/api-route/api-route` | route definition types | Route metadata |
| `@trading-model/http/bootstrap` | `createBootstrap` | Start / stop sequence of a service |
| `@trading-model/http/service-server-factory` | `createServiceServer`, `ServiceServerOptions` | HTTPS server with mTLS |
| `@trading-model/http/metrics-handler` | `createMetricsHandler`, `metricsHandler` | Prometheus endpoint |
| `@trading-model/http/telemetry` | `startTelemetry`, `shutdownTelemetry` | Tracing |
| `@trading-model/http/readiness` | readiness handler | Readiness probe |

## Example

```typescript
import { logger } from "@trading-model/http/logger";
import { sendResponse } from "@trading-model/http/response-exception";
```

## See also

[Health endpoints](../standards/health-endpoints.md), [common.md](./common.md), [api-gateway.md](./api-gateway.md), [Error handling](../standards/error-handling.md).
