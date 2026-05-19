# @trading-model/common

## Overview

**@trading-model/common** is the foundational shared library for the AI Trading Platform monorepo. It provides cross-cutting infrastructure used by all other packages and services: HTTP client, logger, middleware, type definitions, server factories (`createSecureServer`, `createBootstrap`), environment validation (`BaseEnvSchema`, `AddressManagerEnvSchema`), crypto utilities, shared DTOs, and a consolidated error hierarchy.

This package has **zero internal dependencies** — it only depends on external npm packages (`express`, `zod`, `helmet`, `express-rate-limit`, `chained-error`).

## Exports

### `config/` — Configuration & Base Types

| Export | Kind | Description |
|---|---|---|
| `DeliveryMode` | const | Delivery semantics enum: `AT_MOST_ONCE`, `AT_LEAST_ONCE`, `EXACTLY_ONCE` |
| `DeliveryModeEnum` | type | `"at-most-once" \| "at-least-once" \| "exactly-once"` |
| `MarketType` | const + type | Market categories: `"crypto" \| "equity" \| "bond" \| "etf" \| "fx" \| "future"` |
| `SourceType` | const + type | Data source identifiers: `"binance" \| "nyse" \| "bloomberg"` |
| `BaseMarketEntity` | interface | `{ symbol, source, timestamp, market }` — base for all market data entities |
| `CandleEntity` | interface | OHLCV candle with `open, high, low, close, volume, interval, closeTimestamp` |
| `TradeEntity` | interface | Trade with `price, tradeId, quantity, side` |
| `OrderBookEntity` | interface | Order book snapshot with `bids, asks` |
| `BookTickerEntity` | interface | Best bid/ask ticker |
| `TickerEntity` | interface | 24hr ticker statistics |
| `EventMap` | interface | Maps event name strings to their typed payloads (8 market events) |
| `EnumEventMessage` | const | Friendly name → event key mapping |
| `EventMessagesArgs<T>` | type | Resolves payload type for a given event key |
| `EventEnumMap` | type | Union of all event message string values |
| `HttpClient` | class | Centralized HTTP client with mTLS support |
| `HttpRequestOptions` | interface | `{ timeoutMs?, headers? }` |
| `HttpClientError` | class | Thrown on non-2xx responses (includes `statusCode`) |
| `HttpClientTimeoutError` | class | Thrown on request timeout |
| `LogLevel` | enum | `DEBUG(0), INFO(1), WARN(2), ERROR(3)` |
| `LogEntry` | interface | Structured log entry with `timestamp, level, message, context, userId`, etc. |
| `Logger` | class | Structured logger with file output, buffer, and webhook forwarding for errors |
| `logger` | singleton | Pre-configured logger instance (level depends on `NODE_ENV`) |
| `ServiceInstanceName` | const | Service name constants (9 services: discovery, financial-scraper, trader-training, etc.) |

### `middleware/` — Express Middleware

| Export | Kind | Description |
|---|---|---|
| `catchSync` | function | Wraps async route handlers to forward errors to `next()` |
| `handleCoreResponse` | function | Standardized HTTP response from a core service |
| `handleCoreAuthResponse` | function | Standardized auth response with HTTP-only cookie |
| `ensureAtLeastOneField` | function | Validates at least one field is truthy |
| `handleDBError` | function | Normalizes DB errors into standard exceptions |
| `handleCoreError` | function | Centralized error mapper for core operations |
| `handleOnlyDataCore` | function | Generic wrapper extracting data with error handling |
| `MTLSAuthMiddleware` | const | Express middleware enforcing mTLS authentication |
| `HTTP_CODE` | const | Response key constants (`OK`, `Success`, `NotFound`, etc.) |
| `ResponseCodes` | const | Response key → numeric HTTP status mapping |
| `ClassResponseExceptions` | class | Structured error response builder (method per status code) |
| `ResponseException` | function | Factory: `ResponseException("reason").NotFound()` |
| `ResponseProtocole` | const | Global Express error handler (standardizes JSON errors, logs 5xx) |

### `server/` — Server Factories

| Export | Kind | Description |
|---|---|---|
| `TlsPaths` | interface | `{ key, cert, ca }` — file paths to TLS certificates |
| `RateLimitConfig` | interface | `{ windowMs, limit, message? }` |
| `SecureServerOptions` | interface | `{ port, tls, routes, rateLimit?, trustProxy? }` |
| `HttpServer` | interface | `{ close: () => Promise<void> }` |
| `createSecureServer` | function | Creates an HTTPS Express server with mTLS, helmet, rate limiting, and error handling |
| `BootstrapOptions` | interface | `{ name, createServer, onStart?, onStop? }` |
| `createBootstrap` | function | Manages service lifecycle: process signals, graceful shutdown |

### `validation/` — Validation Utilities

| Export | Kind | Description |
|---|---|---|
| `isNonEmptyString` | function | Type guard for non-empty strings |
| `isValidPort` | function | Type guard for port numbers (1–65535) |
| `isValidIP` | function | Type guard for IPv4 addresses |
| `isObject` | function | Type guard for non-null, non-array objects |
| `BaseEnvSchema` | Zod schema | Base environment variables: `NODE_ENV, PORT, TLS_*`, `LOG_LEVEL` |
| `BaseEnv` | type | Inferred from `BaseEnvSchema` |
| `AddressManagerEnvSchema` | Zod schema | Extended env for address-manager services |
| `AddressManagerEnv` | type | Inferred from `AddressManagerEnvSchema` |
| `validateEnv` | function | Parses `process.env` against a Zod schema, exits on failure |

### `contracts/` — Shared DTOs

| Export | Kind | Description |
|---|---|---|
| `SubscribesTopicsPayload` | interface | `{ topics, callbackUrl }` |
| `UnSubscribesTopicsPayload` | interface | `{ topics }` |
| `BrokerConfig` | interface | `{ serviceName, callbackPath, instanceId }` |
| `ServiceRegisterPayload` | interface | `{ name, address, port, protocol, env? }` |
| `HeartbeatPayload` | interface | `{ serviceName, instanceId, authToken }` |
| `ServicesQueryPayload` | interface | `{ serviceName, services, onlyAlive }` |
| `ServiceInstance` | interface | Full registered service descriptor |

### `crypto/` — Cryptographic Utilities

| Export | Kind | Description |
|---|---|---|
| `makePRNG` | function | Seeded PRNG (mulberry32) → `(seed: number) => () => number` |
| `generateRandomStr` | function | Cryptographically random base64url string |

### `utils/` — Error Hierarchies

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

## How to Use

```typescript
import { logger } from "@trading-model/common/config/logger";
import { HttpClient } from "@trading-model/common/config/httpClient";
import { catchSync } from "@trading-model/common/middleware/catchError";
import { ResponseException } from "@trading-model/common/middleware/responseException";
import { MTLSAuthMiddleware } from "@trading-model/common/middleware/MTLSAuth";
import { createSecureServer } from "@trading-model/common/server/createSecureServer";
import { createBootstrap } from "@trading-model/common/server/bootstrap";
import { validateEnv, BaseEnvSchema } from "@trading-model/common/validation/env";
import { isNonEmptyString } from "@trading-model/common/validation/primitives";
import { generateRandomStr } from "@trading-model/common/crypto/random";
import { ServiceNotFoundError } from "@trading-model/common/utils/Errors";

// Validate environment
const env = validateEnv(BaseEnvSchema);

// Create an mTLS-secured HTTP server
const server = createSecureServer({
  port: env.PORT,
  tls: { key: env.TLS_KEY_PATH, cert: env.TLS_CERT_PATH, ca: env.TLS_CA_PATH },
  routes: (app) => {
    app.get("/health", catchSync(async (req, res) => {
      res.json({ status: "ok" });
    }));
  },
});

// Bootstrap lifecycle
const { shutdown } = createBootstrap({
  name: "my-service",
  createServer: () => server,
});

// HTTP client with mTLS
const client = new HttpClient({
  ca: fs.readFileSync(env.TLS_CA_PATH, "utf-8"),
  cert: fs.readFileSync(env.TLS_CERT_PATH, "utf-8"),
  key: fs.readFileSync(env.TLS_KEY_PATH, "utf-8"),
});
const data = await client.get<MyType>("https://other-service/api/data");

// Logger
logger.info("Service started", { port: env.PORT });
logger.error("Something failed", new Error("details"));
```

## Deployment

This package is **not deployed independently**. It is built as a workspace dependency and consumed at build time by other packages and services. The compiled output goes to `dist/` via `npm run build` (tsc, CommonJS output).

All other packages reference it as:
```json
"dependencies": { "@trading-model/common": "*" }
```
