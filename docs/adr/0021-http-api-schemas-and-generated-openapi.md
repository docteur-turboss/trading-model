# ADR-0021: HTTP API Schemas Owned by Services, OpenAPI Generated From Zod

**Status:** Accepted
**Date:** 2026-10
**Verified by:** `bun run api:check` (27/27 public routes and every service-to-service route from registry entries, empty schemas ratchet), `packages/http/tests/unit/adapters/inbound/api-route.spec.ts`, `tests/contract/dead-letter.spec.ts`, `tests/contract/discovery-routes.spec.ts`
**Related:** [ADR-0016](./0016-shared-contracts-ownership.md) (runtime-free `contracts`), [ADR-0015](./0015-hexagonal-layering-completion.md) (layer rules), [ADR-0018](./0018-temporary-frontend-removal.md) (`api:check`), [ADR-0019](./0019-message-broker-as-built.md)

## Context

The 13.09 audit recommends generating the OpenAPI from Zod to stop the drift between the documented API and the runtime. Part of that drift is already guarded: `scripts/api-contract.mjs` (`bun run api:check`) generates `docs/services/openapi/api-gateway.yaml` from the Express routes, so a documented **path** cannot point to a route that does not exist. Nothing guards the **shapes**: the spec has no request body, no query schema and no response schema. State on 2026-10-28, over the 27 routes of `PUBLIC_ROUTES`:

| Service | Public routes | Input validated by Zod | Response schema |
| --- | --- | --- | --- |
| financial-scraper | 13 | path params (`controller-utils.ts`) | none |
| dlq-service | 4 | POST and DELETE bodies; list and replay queries parsed by hand | none |
| audit-logger | 3 | none (query parsed by hand, `query-params.ts`) | none |
| discovery-server | 3 | none (path params used as is) | none |
| trader-trainer | 4 | none | none |

Three facts constrain where the schemas can live and how they are checked:

1. **Shared types cannot carry Zod.** `@trading-model/contracts` owns every shared type and is runtime-free by design (ADR-0016): `primitives` and `contracts` are the foundations, nothing heavier goes in. The shapes that cross a service boundary are therefore typed in `contracts` and validated, separately, by whoever receives them. The two already disagree: message-manager writes `DlqEntry.timestamp` as a `UnixTimestamp` (epoch milliseconds, a number), while dlq-service's `DlqEntrySchema` requires `z.string()`. A dead letter cannot be submitted to dlq-service as written. No check compares the two.
2. **Hand-written DTOs already drifted once.** `@trading-model/validation/adapters/inbound/admin/*.dto.ts` are TypeScript interfaces written for the admin frontend. All 24 of its calls hit non-existent routes (ADR-0018). Interfaces next to the code they describe, with nothing that executes them, do not stay true.
3. **Tests do not type-check.** Every Jest config sets ts-jest `diagnostics: false`. A compile-time assertion placed in a spec never fails. Only `src`, compiled by `tsc` (`bun run build`, CI typecheck job, pre-push), can host one.

Zod 4.5.4 is installed in every workspace and exports JSON Schema natively (`z.toJSONSchema`, with `target: "openapi-3.0"`). Probed on 2026-10-28:

| Zod construct | `io: "input"` (requests) | `io: "output"` (responses) |
| --- | --- | --- |
| `z.iso.datetime()` | `string`, `format: date-time` | same |
| `z.coerce.number().int()` | `integer` | `integer` |
| `z.coerce.date()` | `{}` (anything: the schema says nothing) | `{}` |
| `.transform(...)` | input side exported | **throws** "Transforms cannot be represented" |
| `.brand<"Topic">()` | plain `string` | plain `string`, typed as Zod's brand, not `primitives`' |

## Decision

### 1. Who owns which schema

- **A route's schemas belong to the service that serves it.** Each service declares its HTTP routes, public and service-to-service alike, in one registry module in its inbound HTTP adapter: `src/adapters/inbound/http/api-routes.ts` (or `src/adapters/inbound/api-routes.ts` where the service has no `http/` folder). An entry gives the method, the path, and the Zod schemas of the path params, query, body and of each response status. Zod belongs in an inbound adapter (ADR-0015); domain and application code receive parsed values.
- **A payload exchanged between workspaces** (today `DlqEntry`; next the message envelope checked by message-manager's `PUBLISH_SCHEMA`) keeps its type in `contracts` and gets **one** Zod schema in `@trading-model/validation`, under `src/wire/`, used by both the producer and the consumer. The schema file asserts at compile time (`validation/src/wire/contract-shape.ts`) that the schema **accepts** the contract (the contract's JSON shape, brands removed, is assignable to the schema's input) and **yields** it (the schema's output, brands applied by `.transform(X.of)`, is the contract type). A drift becomes a `tsc` error in `bun run build`. A contract test (`tests/contract`) runs the real producer against the real consumer's validation, so the runtime path is covered too.
- **The gateway does not know the schemas.** `PUBLIC_ROUTES` stays the allowlist of what the gateway proxies. The OpenAPI joins the allowlist with the services' registries.

### 2. One declaration per route

The registry entry is what mounts the route: a helper in `@trading-model/http` (`mountRoute(router, entry, handler)`) registers the Express route from the entry's method and path, parses params, query and body with its schemas, answers 400 with the standard error body on failure, and gives the handler the parsed values. A route cannot exist without its entry, and an entry cannot describe a route that is not mounted. The existing `validateSchema` middleware is folded into it.

### 3. Rules for API schemas

- **Describe the wire, not the domain.** A schema describes the JSON as it travels. Instants are either epoch milliseconds (`z.number().int()`, matching `UnixTimestamp`) or ISO strings (`z.iso.datetime()`); never `z.coerce.date()`, which exports as an empty schema.
- **Requests may transform, responses may not.** Request schemas are exported with `io: "input"`, so a `.transform` or a coercion is documented by its input. Response schemas are exported with `io: "output"` and must be plain descriptions; the generator fails on a transform.
- **Path and query values are strings on the wire.** Use `z.coerce.number()` for numeric ones; it exports as `integer`.
- **No Zod brands.** `.brand()` does not produce the `primitives` brands. A request or wire schema applies them with `.transform(X.of)` (which also enforces the primitive's invariants); a response schema stays plain.
- **One error body.** All errors use `ErrorResponse = { error: string; details?: { field: string; message: string }[] }`, defined once in `@trading-model/http`. Services that answer otherwise (`{ message }`, the Zod error message as text) are aligned when their routes move to the registry.
- **Where a contract and a schema disagree, the contract type is the reference** for cross-workspace payloads. A receiver that already accepted another form keeps accepting it (a union) until its producers are migrated, so a fix never breaks a running caller.

### 4. Generated OpenAPI

`scripts/api-contract.mjs` keeps its AST checks and runs under bun, which imports the TypeScript registries directly (tooling only, not a runtime dependency between workspaces). For each route of `PUBLIC_ROUTES` it emits the parameters, request body and responses from the registry entry, as named `components/schemas`, OpenAPI 3.0.3 (`target: "openapi-3.0"`). The signed-request headers required by dlq-service's `POST /dlq` are declared as a security scheme. `bun run api:check` fails when the spec is stale and when a public route has no registry entry; during the migration, routes still without one are listed in `scripts/api-contract-known-gaps.json`, which may only shrink. Service-to-service routes have entries too; they are published per service in `docs/services/openapi/internal/<service>.yaml`, never in the gateway spec.

### 5. Responses are verified in tests, not in production

Parsing every response costs CPU on every request for a failure that only a code change can cause. Response schemas are checked where code changes are: a test helper parses each handler's response against the entry in the services' controller specs, and the E2E suite parses responses from the real stack. Production only validates input.

### 6. Out of scope

- AsyncAPI for the message topics: message payloads follow rule 1 (one schema in `validation/src/wire/`, compile-time match with `contracts`), without a published spec.
- The admin DTOs of `validation`: the ones still imported (`audit.dto.ts`) are replaced by the registry schemas of audit-logger as its routes migrate; the others are removed.

## Migration

One service at a time, each step leaving `api:check`, `build` and the test suites green:

1. **Done 2026-10-28.** Shared pieces: `ErrorResponse`, `defineRoute`, `parseRequest`, `mountRoute` and the response check `responseIssues` in `@trading-model/http/adapters/inbound/api-route/`; `validation/src/wire/` with the accept/yield assertions; `DlqEntryWire`, now used by dlq-service `POST /dlq` (the `as unknown as DlqEntry` cast that hid the drift is gone), checked by `tests/contract/dead-letter.spec.ts`. `timestamp` takes epoch milliseconds, and still ISO dates and epoch strings (E2E, older callers); `deliveryAttempt` must be ≥ 1 as the contract says.
2. Services, one at a time: registry, `mountRoute`, input schemas for the hand-parsed routes, response schemas checked in the route specs.
   - **dlq-service, done 2026-10-29.** `DLQ_API` (`src/adapters/inbound/api-routes.ts`), mounted after `serviceAuth` and the rate limiters (the signature covers the raw body). The list query is now validated (a non-numeric `limit` is a 400 instead of silently becoming 100; above 1000 it is still capped), invalid input answers the standard `ErrorResponse`, and every response of the routes integration spec is checked against the registry. Typing the responses exposed `StoredDlqEntry.createdAt`, an ISO string cast to `UnixTimestamp`: now typed as a string.
   - **financial-scraper, audit-logger, discovery-server, trader-trainer, done 2026-10-29.** Typing and checking the responses exposed bugs no test caught, all fixed with a regression test on a real Express app:
     - `GET /trade/*` answered 500 as soon as a trade existed: `trade_id` is a BIGINT that ts-sql-query returns as a `bigint`, and `JSON.stringify` throws on it. Rows now go through `toJsonWire` (decimal string).
     - `GET /orderbook/*` sent every level as `{}`: bids and asks are Sets. Same fix (arrays); an unknown key now answers `[]` instead of `null`.
     - `GET /services/<unknown>` answered 500 (`parseServiceName` throws) where 404 was meant; `GET /services/:name/:id` returned an instance of another service, or an expired lease.
     - audit-logger `page=abc` became a NaN skip sent to MongoDB; financial-scraper took any string as a source and a negative order book timestamp threw (500).
     - Specs that pinned the old behaviour (`expect(status).toBe(500)`, a trainer spec re-implementing the routes it claimed to test) were rewritten against the real routes.
   - Also: `brand(X.of)` (a rejected brand is a 400, not a thrown 500) and `responseIssues` now reports fields a response sends but its schema does not declare.
   - **Service-to-service routes, done 2026-10-29.** discovery `/register`, `/heartbeat`, `/token/rotate`, `/unregister` (`DISCOVERY_API`, credential `InstanceToken`), message-manager `/message` and `/subscribe` (`BROKER_API`, the `VALIDATE_SCHEMA` middleware and the controller's second parse removed), the broker callback mounted by every subscriber (`BROKER_CALLBACK_API` in `broker-message`, resolved by the generator through its route provider) and audit-logger's own `/message` (a permissive envelope: any topic, unknown fields kept, the old nested format still accepted). `ApiRoute.security` replaces `signedRequest` (`SignedRequest`, `InstanceToken`). The contract tests now deliver through the route schema, then the handler; a callback schema the producer does not satisfy fails them. Found on the way: the register schema reported an unknown service at `serviceName.serviceName`, and a callback without `payload` (a void event, dropped by JSON) would have been refused (Zod 4 makes `z.unknown()` keys required).
   - **Error bodies.** The platform error handler (`ResponseProtocol`) sent a thrown reason with `type("json").send(<string>)`: not JSON, under a JSON content type. And an unexpected error answered 500 with its raw message (driver errors, hosts). It now answers `{ "error": ... }` (`reason` kept for mTLS and ACL refusals), and `"Internal server error"` for an error that is not an `AppError`, the message staying in the logs. `ResponseException` keeps an object reason as the body instead of stringifying it.
3. **Generator, done 2026-10-29.** `api-contract.mjs` runs under bun, resolves `mountRoute(router, REGISTRY.key, ...)` calls (AST) to their entry, fails on an entry declared but not mounted, and emits parameters, request body, responses, the `ErrorResponse` component and the signed-request security schemes. Public routes without an entry are listed under `schemas` in `scripts/api-contract-known-gaps.json` (23 left), which may only shrink. Registries are loaded from the workspace sources (tsconfig `paths` of `scripts/api-contract.tsconfig.json`, passed with `--tsconfig-override`): they must stay free of side effects. The first version relied on a `Bun.plugin` resolver that bun never called: the registries silently loaded the packages' `dist/`, stale before a build and absent in CI's lint job. The script now refuses to run unless `@trading-model/*` resolves to the sources, and `api:check` was verified with every `dist/` removed. Health and metrics routes stay outside the registries, like the other infrastructure routes.
4. **Accepted 2026-10-29**: the `schemas` ratchet is empty, `bun run api:check` keeps it so.

## Alternatives Considered

| Alternative | Reason |
| --- | --- |
| Zod schemas in `contracts`, types inferred from them | Breaks ADR-0016: `contracts` would carry a runtime dependency into every package, including the foundations |
| Generate Zod from a hand-written OpenAPI (spec first) | Makes the YAML the source and the code a copy; the repository already went code-first (`api:write`), and code-first keeps one declaration per route |
| `@asteasolutions/zod-to-openapi` or similar | Zod 4 exports JSON Schema natively with an OpenAPI 3.0 target; a library adds a dependency for registry helpers that are a few lines here |
| Consumer-driven contract tests (Pact) for the HTTP API | No external consumer since ADR-0018, and producers and consumers share the monorepo: `tests/contract` already runs real producer code against real consumer code |
| Validate responses in production | Cost on every request for a failure only a code change can cause; tests and E2E catch it before release |

## Consequences

### Positive

- A route, its validation, its types and its documentation come from one declaration; the OpenAPI cannot lag behind.
- Shapes shared across services are checked by the compiler on both sides.
- Hand-parsed inputs (audit-logger, dlq-service queries, discovery, trainer) get real validation.

### Negative

- Response schemas for 27 routes are the bulk of the work, and they must be kept in step with handlers (enforced by the controller specs).
- `api-contract.mjs` needs bun, like `observability-gate.mjs`, and its source mapping (`scripts/api-contract.tsconfig.json`) must list every package (checked).
- Until the ratchet is empty, the OpenAPI is complete for some services only.
