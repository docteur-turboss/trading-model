# ADR-0074: Merge the Twelve Shared Packages into Six, One Merge per PR

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0007](./0007-common-package-split.md) (common split), [ADR-0016](./0016-shared-contracts-ownership.md) (ownership; its package map is amended here, its contract-ownership rule stays)
**Verified by:** `bun run deps:check`

## Context

Audit 2026-11-15 (A10): twelve shared packages, an 11-step build order, and packages smaller than some service files (`validation` 322 lines, `crypto` 326, `persistence` 553). The logger lives in `http`, the Redis env schema in `validation` while its parsing is in `persistence`, and the address-manager env schema is far from address-manager. Owner decision (issue #1203, 2026-11-15): target the audit's six packages, one PR per merge, each merge keeping the build green.

## Decision

Target map (who consumes what):

| Target package | Absorbs | Why |
| --- | --- | --- |
| `primitives` + `contracts` | `contracts` stays; `validation/wire` (`dlq-entry`, `service-instance`, `contract-shape`), `service-resolver.types` | wire DTOs are shared contracts (ADR-0016) |
| `runtime-http` | `http`, `server-utils`, logger | every service uses them together; `server-utils` only depends on `http` |
| `persistence` | `redis-env` schema and parsing | one owner for the Redis env |
| `crypto` | unchanged | used by 5 services, depends on nothing above it |
| `model-runtime` | `http/model-api`, `http/signals` (data clients) | consumers of the forward pass are also the consumers of these clients; `http` stays pure transport |
| `messaging-client` | `broker-message`, reduced `address-manager` | same consumers; after the discovery-server DNS routing decision |

`common` and `reliability` are spread over these packages; `validation` shrinks to `validate-env` then disappears. Each env schema moves to the package or service that reads it. No catch-all package is created.

Order, one PR each: (1) `server-utils` into `http` (done with this ADR), (2) `validation` dispersal and `redis-env` (done: `validate-env` and the base env schema moved to `http`, the wire DTOs and `brand` to `contracts`), (2b) done: the scraper/trainer clients and signal history (`model-api/`, `signals/`) moved from `http` to `model-runtime`, so `http` no longer depends on it and is built before it; (3) logger and rename to `runtime-http`: postponed after #1241/#1244; (4) `reliability`/`common` placement: postponed after #1241/#1244; (5) `messaging-client`: postponed after #1241/#1244 (depends on the discovery-server decision). Each PR cleans every `dist/`, regenerates `bun.lock`, and updates AGENTS.md (list and build order), root `build`, `knip.json`, Dockerfiles and `scripts/jest-workspace-mapper.cjs` when needed.

## Consequences

Fewer manifests and build steps; imports of `@trading-model/server-utils/*` become `@trading-model/http/*` (no behavior change). Intermediate states have 11, then fewer, packages.
