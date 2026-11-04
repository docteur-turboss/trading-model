# @trading-model/server-utils — Server Bootstrap

HTTPS server factory with SPIFFE mTLS and SVID rotation, service bootstrap and graceful shutdown, `/metrics` handler, readiness and OpenTelemetry setup.

## Dependency rule

Depends on `primitives`, `common`, `http` (+ `express`, `helmet`, `express-rate-limit`, `prom-client`, OpenTelemetry SDK). Not imported by `validation` or `crypto`.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/server-utils/application/services/bootstrap` | `createBootstrap` | Start / stop sequence of a service |
| `@trading-model/server-utils/adapters/inbound/service-server-factory` | `createServiceServer`, `ServiceServerOptions` | HTTPS server with mTLS |
| `@trading-model/server-utils/adapters/inbound/metrics-handler` | `createMetricsHandler`, `metricsHandler` | Prometheus endpoint |
| `@trading-model/server-utils/infrastructure/telemetry` | `initializeTelemetry`, `shutdownTelemetry`, `TelemetryConfig` | Tracing |
| `@trading-model/server-utils/adapters/inbound/readiness` | readiness handler | Readiness probe |

## Example

```typescript
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
```

## See also

[Health endpoints](../standards/health-endpoints.md), [common.md](./common.md).
