# @trading-model/http — Server Bootstrap

HTTPS server factory with SPIFFE mTLS and SVID rotation, service bootstrap and graceful shutdown, `/metrics` handler, readiness and OpenTelemetry setup.

## Dependency rule

Depends on `primitives`, `common`, `http` (+ `express`, `helmet`, `express-rate-limit`, `prom-client`, OpenTelemetry SDK). Not imported by `validation` or `crypto`.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/http/bootstrap` | `createBootstrap` | Start / stop sequence of a service |
| `@trading-model/http/service-server-factory` | `createServiceServer`, `ServiceServerOptions` | HTTPS server with mTLS |
| `@trading-model/http/metrics-handler` | `createMetricsHandler`, `metricsHandler` | Prometheus endpoint |
| `@trading-model/http/telemetry` | `startTelemetry`, `shutdownTelemetry` | Tracing |
| `@trading-model/http/readiness` | readiness handler | Readiness probe |

## Example

```typescript
import { createBootstrap } from "@trading-model/http/bootstrap";
import { createServiceServer } from "@trading-model/http/service-server-factory";
```

## See also

[Health endpoints](../standards/health-endpoints.md), [common.md](./common.md).
