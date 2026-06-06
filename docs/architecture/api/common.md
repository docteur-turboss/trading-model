# @trading-model/common — Shared Infrastructure Package

Central utility package consumed by all other packages and services in the monorepo.

## Overview

**@trading-model/common** is the foundational shared library. It provides cross-cutting infrastructure used by all other packages and services: HTTP client, logger, middleware, type definitions, server factories (`createSecureServer`, `createBootstrap`), environment validation (`BaseEnvSchema`, `AddressManagerEnvSchema`), crypto utilities, shared DTOs, and a consolidated error hierarchy.

This package has **zero internal dependencies** — it only depends on external npm packages (`express`, `zod`, `helmet`, `express-rate-limit`, `chained-error`).

## Logger

Structured logging system with severity levels, memory buffer, file output, and external webhook for errors.

- **Import**: `@trading-model/common/config/logger`
- **Class**: `Logger`
- **Pre-configured instance**: `logger`

```ts
import { logger, LogLevel } from '@trading-model/common/config/logger';
```

| Method                            | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `logger.debug(message, context?)` | Log at DEBUG level                                 |
| `logger.info(message, context?)`  | Log at INFO level                                  |
| `logger.warn(message, context?)`  | Log at WARN level                                  |
| `logger.error(message, context?)` | Log at ERROR level + sends webhook in prod/staging |

**LogLevel**: `DEBUG = 0`, `INFO = 1`, `WARN = 2`, `ERROR = 3`

Features:

- File output to `./log/<date>-<level>.log`
- ERROR webhook via `ERROR_URL_WEBHOOK` or `setErrorHandlerService(url)`
- FIFO buffer (1000 entries max)
- Unique session ID per instance
- Circular reference detection

## Bootstrap

Lifecycle manager for services.

- **Import**: `@trading-model/common/server/bootstrap`
- **Function**: `createBootstrap(options)`

```ts
import { createBootstrap } from '@trading-model/common/server/bootstrap';
```

| Option         | Type               | Description              |
| -------------- | ------------------ | ------------------------ |
| `name`         | `string`           | Service name             |
| `createServer` | `() => HttpServer` | HTTPS server factory     |
| `onStart?`     | `() => void`       | Callback after startup   |
| `onStop?`      | `() => void`       | Callback before shutdown |

Features:

- Attaches `SIGTERM`, `SIGINT` handlers
- Captures `uncaughtException` and `unhandledRejection`
- Immediate exit on fatal error

## SecureServer

HTTPS server factory with mTLS, rate limiting, and Helmet.

- **Import**: `@trading-model/common/server/create-secure-server`
- **Function**: `createSecureServer(options)`

```ts
import { createSecureServer } from '@trading-model/common/server/create-secure-server';
```

| Option        | Type              | Description                 |
| ------------- | ----------------- | --------------------------- |
| `port`        | `number`          | Listening port              |
| `tls`         | `TlsPaths`        | key/cert/ca paths           |
| `routes`      | `(app) => void`   | Route mounting              |
| `rateLimit?`  | `RateLimitConfig` | Rate limiting configuration |
| `trustProxy?` | `boolean`         | Trust proxy (default: true) |

Features:

- mTLS (TLSv1.3, `requestCert: true`, `rejectUnauthorized: true`)
- Rate limiting via `express-rate-limit` (100 req/15min by default)
- Helmet security headers
- `GET /ping` endpoint (constant `PING_PATH`)
- `MTLSAuthMiddleware` injected automatically
- `ResponseProtocole` as last middleware

## Environment Validation

Fail-fast validation of environment variables via Zod.

- **Import**: `@trading-model/common/validation/env`

```ts
import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';
```

| Schema                    | Description                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `BaseEnvSchema`           | `NODE_ENV`, `PORT`, `TLS_KEY_PATH`, `TLS_CERT_PATH`, `TLS_CA_PATH`, `LOG_LEVEL`        |
| `AddressManagerEnvSchema` | `APP_NAME`, `SERVICE_NAME`, `INSTANCE_ID`, `CACHE_TTL_MS`, `ADDRESS_MANAGER_URL`, etc. |
| `validateEnv(schema)`     | Parses `process.env` and throws `ConfigurationError` on failure                        |

## HttpClient

HTTP client with mTLS support for service-to-service calls.

- **Import**: `@trading-model/common/config/http-client`

```ts
import { HttpClient } from '@trading-model/common/config/http-client';
```

| Method                            | Signature |
| --------------------------------- | --------- |
| `get<T>(url, options?)`           | `GET`     |
| `post<T>(url, body?, options?)`   | `POST`    |
| `delete<T>(url, body?, options?)` | `DELETE`  |

Options: `timeoutMs`, `headers`
Errors: `HttpClientError` (non-2xx status), `HttpClientTimeoutError` (timeout)

## Middleware

All middlewares are imported from `@trading-model/common/middleware/`.

### catchSync

Wrapper for async Express route handlers.

- **Import**: `@trading-model/common/middleware/catch-error`
- **Function**: `catchSync(handler)`

### ResponseException

Standardised HTTP errors with fluent status code methods.

- **Import**: `@trading-model/common/middleware/response-exception`
- **Function**: `ResponseException(reason)`

```ts
ResponseException('message').NotFound(); // { status: 404, data: 'message' }
ResponseException('msg').BadRequest(); // { status: 400, data: 'msg' }
ResponseException().NoContent(); // { status: 204, data: undefined }
```

Available codes: `ServiceUnavailable(503)`, `UnknownError(500)`, `InvalidToken(498)`, `TooManyRequests(429)`, `IMATeapot(418)`, `PayloadTooLarge(413)`, `Gone(410)`, `Conflict(409)`, `MethodNotAllowed(405)`, `NotFound(404)`, `Forbidden(403)`, `PaymentRequired(402)`, `Unauthorized(401)`, `BadRequest(400)`, `NoContent(204)`, `OK(201)`, `Success(200)`

### ResponseProtocole

Global Express error normalisation middleware.

- **Import**: `@trading-model/common/middleware/response-protocole`
- Logs 5xx errors with stack trace, URL, method, IP

### MTLSAuth

mTLS authentication middleware.

- **Import**: `@trading-model/common/middleware/mtls-auth`
- Checks `socket.authorized`, extracts client certificate identity
- Attaches `clientIdentity` to the request (declared via global Express `Request` augmentation — `declare global { namespace Express { interface Request { clientIdentity: string } } }`)

### handleCoreResponse / handleCoreAuthResponse

Response normalisation utilities.

- **Import**: `@trading-model/common/middleware/handle-core-response`

| Function                              | Description                                                |
| ------------------------------------- | ---------------------------------------------------------- |
| `handleCoreResponse(coreFn, res)`     | Executes a core function and sends a standardised response |
| `handleCoreAuthResponse(coreFn, res)` | Same + sets an HTTP-only `token` cookie                    |
| `ensureAtLeastOneField(fields)`       | Ensures at least one field is truthy                       |

## HTTP Error Reference

| Status Code | Error                 | Description              |
| ----------- | --------------------- | ------------------------ |
| 400         | Bad Request           | Invalid input            |
| 401         | Unauthorized          | Missing or invalid auth  |
| 403         | Forbidden             | Insufficient permissions |
| 404         | Not Found             | Resource not found       |
| 500         | Internal Server Error | Unexpected error         |

## Event Types

- **Import**: `@trading-model/common/config/event.types`

| Export                                                                               | Description                                                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `EnumEventMessage`                                                                   | Event name constants (testEvent, fetchRecentTrades, fetchCandlestickSeries, etc.) |
| `EventMap`                                                                           | Event → payload type mapping                                                      |
| `EventMessagesArgs<K>`                                                               | Payload type for a given event K                                                  |
| `EventEnumMap`                                                                       | Union of all event name strings                                                   |
| `MarketType`                                                                         | `CRYPTO`, `EQUITY`, `BOND`, `ETF`, `FX`, `FUTURE`                                 |
| `SourceType`                                                                         | `BLOOMBERG`, `BINANCE`, `NYSE`                                                    |
| `CandleEntity`, `TradeEntity`, `OrderBookEntity`, `BookTickerEntity`, `TickerEntity` | Market data entities                                                              |

## Service Types

- **Import**: `@trading-model/common/config/services.types`

```ts
ServiceInstanceName.DiscoveryService; // 'discovery-service'
ServiceInstanceName.MessageDeliveryService; // 'message-delivery-service'
ServiceInstanceName.FinancialScrapperService; // 'financial-scrapper-service'
ServiceInstanceName.TraderTrainingService; // 'trader-training-service'
// + CoreBalancerService, OfficialDataScrapperService, etc.
```

## Delivery Types

- **Import**: `@trading-model/common/config/delivery-mode.types`

```ts
DeliveryMode.AT_MOST_ONCE; // 'at-most-once'
DeliveryMode.AT_LEAST_ONCE; // 'at-least-once'
DeliveryMode.EXACTLY_ONCE; // 'exactly-once'
```

## Contracts (Shared DTOs)

| Export                      | Kind      | Description                                 |
| --------------------------- | --------- | ------------------------------------------- |
| `SubscribesTopicsPayload`   | interface | `{ topics, callbackUrl }`                   |
| `UnSubscribesTopicsPayload` | interface | `{ topics }`                                |
| `BrokerConfig`              | interface | `{ serviceName, callbackPath, instanceId }` |
| `ServiceRegisterPayload`    | interface | `{ name, address, port, protocol, env? }`   |
| `HeartbeatPayload`          | interface | `{ serviceName, instanceId, authToken }`    |
| `ServicesQueryPayload`      | interface | `{ serviceName, services, onlyAlive }`      |
| `ServiceInstance`           | interface | Full registered service descriptor          |

## Crypto

| Export              | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `makePRNG`          | Seeded PRNG (mulberry32) → `(seed: number) => () => number` |
| `generateRandomStr` | Cryptographically random base64url string                   |

## Error Hierarchy

```
TradingModelError (abstract)
├── AddressManagerBaseError (abstract)
│   ├── ServiceNotFoundError
│   ├── ServiceUnreachableError
│   ├── AuthenticationError
│   └── AddressManagerError
├── MessageManagerBaseError (abstract)
│   ├── MessageManagerError
│   ├── MetadataBuilderError
│   ├── TimeoutError
│   ├── NackError
│   └── DeadLetterError
└── AgentBaseError (abstract)
    └── AgentError
```

## Utils

- **Import**: `@trading-model/common/utils/sleep`

```ts
sleep(ms: number): Promise<void>
```

## Deployment

This package is **not deployed independently**. It is built as a workspace dependency and consumed at build time by other packages and services. The compiled output goes to `dist/` via `npm run build` (tsc, CommonJS output).

All other packages reference it as:

```json
"dependencies": { "@trading-model/common": "*" }
```
