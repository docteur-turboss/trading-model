# @trading-model/http — HTTP Platform

Express middleware (mTLS identity and authorization, correlation id, ACL), response helpers, the outbound `HttpClient` and the concrete logging pipeline.

## Dependency rule

Depends on `primitives`, `contracts`, `common`, `reliability` (+ `express`, `zod`, `prom-client`, OpenTelemetry API). `validation`, `server-utils` and `crypto` depend on it, so it must not import them.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/http/adapters/inbound/response-exception` | `ResponseException`, `sendResponse`, `HTTP_CODE` | Typed error responses |
| `@trading-model/http/infrastructure/logger` | `logger`, `createLogger`, `Logger`, `LogLevel` | Logger used by services (re-export shim, [ADR-0010](../adr/0010-clean-architecture-migration.md)) |
| `@trading-model/http/adapters/inbound/api-route/mount-route` | `mountRoute`, `ApiRouteHandler` | Declarative route mounting |
| `@trading-model/http/adapters/outbound/http-client` | `HttpClient` | mTLS client with retry and circuit breaker |
| `@trading-model/http/adapters/inbound/api-route/api-route` | route definition types | Route metadata |

## Example

```typescript
import { logger } from "@trading-model/http/infrastructure/logger";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
```

## See also

[common.md](./common.md), [api-gateway.md](./api-gateway.md), [Error handling](../standards/error-handling.md).
