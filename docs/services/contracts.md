# @trading-model/contracts — Shared Contracts

Owner of every shared, runtime-free contract: event types, message envelope, service registry types, signed request, DLQ types, `HTTP_STATUS`, HTTP headers and the `LoggerPort` registry ([ADR-0016](../adr/0016-shared-contracts-ownership.md)).

## Dependency rule

Depends **only on `@trading-model/primitives`**. Never import `common`, `http` or any higher package: `bun run deps:check` fails on it. Keep it free of runtime behaviour beyond constants and the logger registry.

## Main exports

Subpath imports (`@trading-model/contracts/<file>`; `exports` maps `./*` to `dist/*.js`). Most used by services:

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/contracts/market-data.types` | market-data types (candles, trades, tickers) | Payloads from scraper to trainer |
| `@trading-model/contracts/http-status` | `HTTP_STATUS`, `HttpStatusCode` | Named status codes, no magic numbers |
| `@trading-model/contracts/logger-registry` | `LoggerPort`, `setLogger`, `getLogger` | Packages log through a port; the service registers the concrete logger |
| `@trading-model/contracts/message-types` | `Message`, `MessageMetadata`, `RoutingType`, `DeliveryType` | Message envelope on the bus |
| `@trading-model/contracts/service-registry-types` | `Protocol`, `ServiceInstance` | Discovery protocol |

Also: `signed-request`, `http-headers`, `event-map`, `audit-events`, `market-events`, `training-events`, `dlq-events`, `dlq-types`, `error-response`.

## Example

```typescript
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { getLogger } from "@trading-model/contracts/logger-registry";
```

## See also

[common.md](./common.md#package-map-post-split), [primitives.md](./primitives.md), [ADR-0016](../adr/0016-shared-contracts-ownership.md).
