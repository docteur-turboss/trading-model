# ADR-0007: Split @trading-model/common into Domain Packages

**Status:** Implemented
**Date:** 2026-06

> **Outcome (2026-09, completed):** The full split is now implemented. Extracted packages: `@trading-model/validation`, `@trading-model/server-utils`, `@trading-model/crypto`, **`@trading-model/http`** (middleware + http client + logging) and **`@trading-model/jobs`** (worker protocol + orphan recovery). `@trading-model/address-manager` and `@trading-model/broker-message` remain separate packages. Final workspace set: **8 packages** — `common`, `http`, `jobs`, `validation`, `server-utils`, `crypto`, `address-manager`, `broker-message`. The http and jobs packages use the clean-architecture layout (`shared/domain/application/infrastructure/adapters`) established by ADR-0010; the logging cluster (`logger`, `log-dispatcher`, `console-formatter`, `session-id-generator`, …) moved to `@trading-model/http` together with the HTTP client, and `@trading-model/jobs` depends on it for `logger` + `http-client`. All consumers were hard-migrated (no re-export shims retained in `common`); `common` keeps only the remaining domains (primitives, contracts, reliability, persistence, utils, ws, config misc).
>
> **Outcome (2026-10, completed):** The split was extended to the residual `common` domains, which shrank from **135 to 30 source files**. Four new packages were extracted in strict topological order (no cycles — DFS-verified): **`@trading-model/primitives`** (64 files, ex-`common/src/domain/**` — branded types, pagination, circuit-state, service-identity, retry-policy, topic-binding…; **zero dependencies**), **`@trading-model/contracts`** (21 — ex-`common/src/contracts/**` + `http-status.ts` + `http-headers.ts` + `logger-registry.ts` (LoggerPort + setLogger/getLogger); depends on primitives), **`@trading-model/reliability`** (6 — ex-`common/src/reliability/**`: circuit-breaker, circuit-state-machine, latency-tracker, heartbeat interfaces…; depends on primitives + contracts) and **`@trading-model/persistence`** (14 — ex-`common/src/persistence/**` + `config/redis-config.ts` absorbed; ioredis + mongodb; depends on common one-way + primitives + contracts). Final build order: primitives → contracts → reliability → common → persistence → http → validation → server-utils → crypto → jobs → address-manager → broker-message. Final workspace set: **12 packages**. The hard-migration convention (no re-export shims) was reaffirmed: ~440 files re-routed monorepo-wide, 17+ package.json/jest.config updated, root `build:*` scripts and admin-interface Vitest/Vite aliases updated. `common` now holds only `config/`, `utils/` and `shared/` (residual config + cross-cutting utilities + shared Zod schemas).
>
> **Outcome (2026-10-22, closed):** The last deprecated surface of `common` was removed: the `config/event.types` facade (14 `@deprecated` re-exports of `@trading-model/contracts`) is gone and its 58 importers across 7 workspaces were hard-migrated to the owning `contracts` modules; the non-deprecated unions (`EventMap`, `EventEnumMap`, `EventMessagesArgs`) moved to `@trading-model/contracts/event-map`. The canonical `Optimizer` enum moved from `validation/adapters/inbound/admin/training.dto` to `@trading-model/contracts/training-events` (the DTO re-exports it). `common` is now **29 source files** (`config/` 5, `utils/` 22, `shared/schemas/` 2) with no deprecated exports. See [ADR-0015](./0015-hexagonal-layering-completion.md).

## Context

`@trading-model/common` has grown to 69 files across 14 unrelated domains (server bootstrapping, middleware, crypto, worker protocols, recovery, validation, contracts, feature flags, circuit breakers, etc.). This God Object antipattern causes:

- Every change to common triggers a rebuild of all 14 workspaces
- No independent versioning of subdomains
- Test matrix explosion (14× per change)
- Navigation difficulty for new contributors

## Decision

Split `@trading-model/common` into 5 focused packages, each with a clear domain boundary:

### Proposed Package Structure

| New Package                   | Domains                                 | Will contain                                                                                                                             |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@trading-model/server-utils` | `server/`                               | `bootstrap.ts`, `create-secure-server.ts`, `configure-app.ts`, `constants.ts`, `server-factory.ts`                                       |
| `@trading-model/http`         | `middleware/` + `config/` (http client) | `mtls-auth.ts`, `handle-core-error.ts`, `response-exception.ts`, `correlation-id.ts`, `error-tracking.ts`, `http-client.ts`, `logger.ts` |
| `@trading-model/crypto`       | `crypto/`                               | `random.ts`, `token-service.ts`, `ca-client.ts`                                                                                          |
| `@trading-model/jobs`         | `worker/` + `recovery/`                 | `worker-client.ts`, circuit breaker, retry logic, orphan recovery                                                                        |
| `@trading-model/validation`   | `validation/` + `contracts/`            | `env.ts`, Zod schemas, shared type contracts, event types                                                                                |

### Migration Strategy

1. **Phase 1** — Extract `@trading-model/server-utils` and `@trading-model/validation` (no inter-package deps)
2. **Phase 2** — Extract `@trading-model/crypto` (depends on validation)
3. **Phase 3** — Extract `@trading-model/http` (depends on crypto, validation)
4. **Phase 4** — Extract `@trading-model/jobs` (depends on http, crypto)

### Compatibility

During migration, `@trading-model/common` will re-export from the new packages using `"dependencies"` in its package.json. This preserves backward compatibility while services migrate their imports.

## Alternatives Considered

| Alternative                    | Reason for Rejection                                      |
| ------------------------------ | --------------------------------------------------------- |
| Keep common as-is              | Fragile — change propagation, no versioning               |
| Monolithic SDK                 | Inconsistent with microservice architecture               |
| Use a single `index.ts` barrel | Doesn't solve the rebuild problem — still one big package |

## Consequences

### Positive

- Isolated rebuilds: changing worker code only rebuilds `@trading-model/jobs`
- Independent versioning per domain
- Clear package purpose for new contributors
- Reduced test matrix per change

### Negative

- Migration requires updating imports across 14 workspaces
- Package dependency chain becomes more complex
- Initial overhead of creating 4 new packages + CI updates
