# ADR-0007: Split @trading-model/common into Domain Packages

**Status:** Accepted
**Date:** 2026-06

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
