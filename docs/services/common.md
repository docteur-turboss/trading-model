# @trading-model/common — Shared Infrastructure Package (Residual)

Residual shared package consumed by other packages and services in the monorepo. After the ADR-0007 split (extended 2026-10), `common` is deliberately small: it keeps only residual config, cross-cutting utilities and shared Zod schemas. The bulk of the former god-package now lives in dedicated packages — see [Package Map Post-Split](#package-map-post-split).

## Why This Package Exists

Some concerns are genuinely cross-cutting and have no single owning domain: the `AppError` base class and `ErrorCodes`, retry/backoff helpers, SPIFFE identity parsing, TLS path config, cache abstractions, and log sanitization. Keeping them in one small, tested, versioned package avoids duplication without recreating a god-object.

> **Package split (ADR-0007, extended 2026-10):** `common` went from 135 → **30 source files**. Hard migration — **no re-export shims**. Moved out to dedicated packages:
> - Domain primitives (branded types, pagination, circuit-state, service-identity, retry-policy, topic-binding…) → `@trading-model/primitives`
> - Contracts (event types, market-data, http-status, http-headers, LoggerPort registry) → `@trading-model/contracts`
> - Reliability (circuit-breaker, circuit-state-machine, latency-tracker, heartbeat interfaces) → `@trading-model/reliability`
> - Persistence (Redis/Mongo connection managers, store adapters, key builders) → `@trading-model/persistence`
> - Server bootstrap / secure HTTPS factory → `@trading-model/server-utils`
> - Environment validation & Zod schemas → `@trading-model/validation`
> - Crypto primitives → `@trading-model/crypto`
> - HTTP middleware, HTTP client, logging system → `@trading-model/http`
> - Distributed worker protocol & orphan recovery → `@trading-model/jobs`

`common` depends on `@trading-model/primitives` and `@trading-model/contracts` (plus external `zod`, `express`, `chained-error`). It has **no** dependency on `http`, `validation`, `server-utils` or `crypto`.

## Package Map Post-Split

The monorepo has **12 shared packages** under the `@trading-model/*` scope. Build order is topological (base → derived); there are **no cyclic dependencies**. `primitives` and `contracts` are the foundations and must never import higher-layer packages such as `http`.

| # | Package | Role | Dependencies |
|---|---------|------|--------------|
| 1 | `@trading-model/primitives` | Pure domain primitives: branded types, pagination, circuit-state, service-identity, retry-policy, topic-binding. **Zero deps.** | — |
| 2 | `@trading-model/contracts` | Shared contracts: event/market-data types, http-status, http-headers, `LoggerPort` registry (setLogger/getLogger) | primitives |
| 3 | `@trading-model/reliability` | Circuit-breaker, circuit-state-machine, latency-tracker, heartbeat interfaces | primitives, contracts |
| 4 | `@trading-model/common` | Residual shared infra: `AppError`/`ErrorCodes`, retry/backoff, SPIFFE, TLS config, cache, sanitize, shared schemas | primitives, contracts |
| 5 | `@trading-model/persistence` | Redis/Mongo connection managers, store adapters, key builders (absorbed `redis-config`) | common, primitives, contracts (+ ioredis, mongodb) |
| 6 | `@trading-model/http` | HTTP middleware, HTTP client, concrete logging pipeline | primitives, contracts, common, reliability |
| 7 | `@trading-model/validation` | Environment validation, Zod schemas, DTOs, shared type contracts | primitives, contracts, common, http |
| 8 | `@trading-model/server-utils` | Secure HTTPS server factory, TLS watcher/loader, bootstrap & shutdown, signal handling, telemetry | primitives, contracts, common, http |
| 9 | `@trading-model/crypto` | Hashing, request signing, token generation, secure randomness | primitives, contracts, common, validation |
| 10 | `@trading-model/jobs` | Distributed worker protocol, orphan recovery | primitives, contracts, common, http |
| 11 | `@trading-model/address-manager` | Service discovery client, token manager, service cache with health checking, load balancing | primitives, contracts, common, persistence, http, reliability, server-utils, validation |
| 12 | `@trading-model/broker-message` | Inter-service messaging SDK: message-manager client, event emitter, controller/routes, WSS client | primitives, contracts, address-manager, common, http, jobs, validation |

## What Remains in `common`

### `config/`

| File | Purpose |
|------|---------|
| `services.types.ts` | Re-exports `ServiceInstanceName`, `ALL_SERVICE_NAMES`, `parseServiceName`, `registerServiceName` (canonical definitions live in `@trading-model/primitives/service-instance-name`) |
| `delivery-mode.types.ts` | `DeliveryMode` enum: `AtMostOnce`, `AtLeastOnce`, `ExactlyOnce` |
| `event.types.ts` | **Deprecated** facade — re-exports per-context types from `@trading-model/contracts`. Import directly from `contracts` for new code (see [Event Types](#event-types)) |
| `db-connection-config.ts` | `createDbConfigFromEnv()` — builds `DbConnectionConfig` from `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` |
| `tls-paths.ts` | `TlsPaths`, `TlsEnvVars`, `TlsConfig`, `TlsPemBundle`, Zod `TlsEnvVarsSchema`, and helpers (`buildTlsFromEnv`, `resolveSecureContextOptions`, …) |
| `workload-identity.ts` | SPIFFE workload-identity primitives (ADR-0011): trust domain, SPIFFE ID scheme, canonical service identities, `parseSpiffeId`, `buildSpiffeId`, `extractServiceName` |

> Note: `redis-config` was absorbed into `@trading-model/persistence` — it is **not** in `common`.

### `utils/`

| File | Purpose |
|------|---------|
| `errors.ts` + `errors/` | `AppError`, `ErrorCodes`, `normalizeError`. The `errors/` sub-directory holds per-domain error-code groups: `base`, `general`, `auth`, `agent`, `messaging`, `address-manager`, `service-discovery` |
| `retry.ts` | `retry(fn, options)` — retry loop with exponential backoff, `maxRetries`, `timeoutMs`, optional `shouldRetry` guard |
| `backoff-config.ts` | `BackoffConfig`, `computeExponentialBackoff()` — shared backoff math used by `retry` |
| `sleep.ts` | `sleep(ms): Promise<void>` |
| `cache.ts` | `ICache<T>`, `ISyncCache<T>` — cache abstractions (get/set/delete/clear/has/invalidate with TTL) |
| `ttl-cache-base.ts` | Base class for TTL-based cache implementations |
| `circular-buffer.ts` | Fixed-capacity circular buffer |
| `sanitize.ts` | `sanitizeForLog()` — strips PEM blocks and secrets before logging |
| `safe-stringify.ts` | Cycle-safe JSON stringification |
| `deterministic-stringify.ts` | Deterministic JSON serialization for cryptographic signing (recursively sorts object keys) |
| `anonymize-ip.ts` | IP anonymization for privacy-safe logging |
| `comma-separated.ts` | Parse comma-separated env strings into arrays |
| `delay-range.ts` | Compute a random delay within a range (jitter) |
| `timer-handle.ts` | Timer handle abstraction (clear-safe timers) |
| `spiffe.ts` | Re-export facade of the SPIFFE helpers defined in `config/workload-identity.ts` |

### `shared/schemas/`

| File | Purpose |
|------|---------|
| `primitives.schema.ts` | Zod schemas for branded primitives: `PriceSchema`, `VolumeSchema` |
| `market-data-schema.ts` | Shared market-data Zod schema |

## Error Handling

The project uses a single error class with a discriminant code property.

- **Import**: `@trading-model/common/utils/errors`

```ts
import { AppError, ErrorCodes, normalizeError } from '@trading-model/common/utils/errors';
```

| Export | Description |
| ------ | ----------- |
| `AppError` | Single application error class with `code` and `cause` |
| `ErrorCodes` | Enum of error codes (`SERVICE_NOT_FOUND`, `MESSAGE_MANAGER_ERROR`, `AGENT_ERROR`, etc.) |
| `normalizeError(err)` | Normalizes any unknown error into a proper `Error` |

## Retry & Backoff

- **Import**: `@trading-model/common/utils/retry`

```ts
import { retry } from '@trading-model/common/utils/retry';
```

`RetryOptions` extends `BackoffConfig` with `maxRetries`, optional `timeoutMs`, and an optional `shouldRetry()` guard that aborts the loop when it returns `false`. Backoff math lives in `@trading-model/common/utils/backoff-config` (`computeExponentialBackoff`).

## Event Types

Event types are owned by `@trading-model/contracts` (the former `@trading-model/common/config/event.types` facade was removed, see ADR-0015):
- Market events & market data types: `@trading-model/contracts/market-events` + `@trading-model/contracts/market-data.types`
- Audit events: `@trading-model/contracts/audit-events`
- Training events (and the canonical `Optimizer` enum): `@trading-model/contracts/training-events`

The combined helpers live in `@trading-model/contracts/event-map`:

| Export | Description |
| ------ | ----------- |
| `EventMap` | Event → payload type mapping (MarketEventMap ∪ AuditEventMap ∪ TrainingEventMap) |
| `EventMessagesArgs<K>` | Payload type for a given event K |
| `EventEnumMap` | Union of all valid event name strings |

## Service Types & Delivery Modes

- **Service names**: `@trading-model/common/config/services.types` (re-exports `ServiceInstanceName` from `@trading-model/primitives/service-instance-name`)
- **Delivery modes**: `@trading-model/common/config/delivery-mode.types` — `DeliveryMode.AT_MOST_ONCE | AT_LEAST_ONCE | EXACTLY_ONCE`

## SPIFFE Workload Identity

- **Import**: `@trading-model/common/config/workload-identity` (or the `utils/spiffe` facade)

Provides the platform's SPIFFE trust domain, ID scheme, canonical service identities (ADR-0011): `buildSpiffeId`, `parseSpiffeId`, `isSpiffeId`, `extractServiceName`, `extractCanonicalServiceName`, `normalizeServiceName`, `PLATFORM_SERVICES`.

## TLS Configuration

- **Import**: `@trading-model/common/config/tls-paths`

`TlsPaths` (canonical TLS file-path triple), `TlsEnvVars` + `TlsEnvVarsSchema` (Zod validation of `TLS_KEY_PATH`/`TLS_CERT_PATH`/`TLS_CA_PATH`), `TlsConfig` (paths or in-memory PEMs), and helpers `buildTlsFromEnv`, `resolveSecureContextOptions`, `toSecureContextOptions`.

## Utils

```ts
import { sleep } from '@trading-model/common/utils/sleep';
import { deterministicStringify } from '@trading-model/common/utils/deterministic-stringify';
import { sanitizeForLog } from '@trading-model/common/utils/sanitize';
```

`deterministicStringify` produces deterministic JSON for cryptographic signing (recursively sorts object keys; preserves array order; handles primitives, nulls, nested objects). `sanitizeForLog` strips PEM blocks and secrets before logging.

## Moved-Out Modules (Where They Are Now)

| Former `common` concern | Now lives in |
| ----------------------- | ------------|
| Logger / logging pipeline | `@trading-model/http` (concrete `Logger`); `LoggerPort` registry in `@trading-model/contracts/logger-registry` |
| Contracts (events, market-data, http-status, http-headers) | `@trading-model/contracts` |
| Domain primitives (branded types, pagination, identities) | `@trading-model/primitives` |
| Circuit breakers, latency tracker, heartbeats | `@trading-model/reliability` |
| Redis/Mongo stores, connection managers, `redis-config` | `@trading-model/persistence` |
| Server bootstrap, secure HTTPS factory, TLS loading | `@trading-model/server-utils` |
| Environment validation (Zod) | `@trading-model/validation` |
| Crypto primitives (PRNG, random string) | `@trading-model/crypto` |
| HTTP middleware, HTTP client | `@trading-model/http` |
| Worker protocol, orphan recovery | `@trading-model/jobs` |

## Deployment

This package is **not deployed independently**. It is built as a workspace dependency and consumed at build time. Compiled output goes to `dist/` via `bun run build` (tsc, CommonJS).

Consumers reference it as:

```json
"dependencies": { "@trading-model/common": "*" }
```
