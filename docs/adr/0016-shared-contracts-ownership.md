# ADR-0016: Shared Contracts Owned by `@trading-model/contracts` and Manifest-Checked Dependencies

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0007](./0007-common-package-split.md) (common split), [ADR-0010](./0010-clean-architecture-migration.md) (DDD layout), [ADR-0015](./0015-hexagonal-layering-completion.md) (hard-migration convention)

## Context

The architecture audit of 2026-09-13 reported that `@trading-model/common` declared `crypto`, `server-utils` and `validation` as runtime dependencies although those packages depend on `common`, the imports coming only from orphan tests. Re-verified on 2026-10-23, that finding is closed (`common` now depends only on `primitives` and `contracts`), but the ADR-0007/0010 splits had moved the same pattern elsewhere:

- `validation/src/domain/contracts/` mixed **four pure re-export shims** of `@trading-model/contracts` (`recovery.types`, `worker-protocol.types`, `market-events`, `audit-events`) with **four shared contracts that have nothing to do with validation** (`message.types`, `service-registry.types`, `signed-request.types`, `dlq.types`). Packages that need only types (`address-manager`, `broker-message`, `crypto`, `jobs`) and most services had to depend on `validation` to get them.
- `jobs` tests imported `validation` without declaring it, and `validation` imported its own shim through its package name.
- `common/tests/helpers/mock-common.ts` imported `@trading-model/http` (which depends on `common`); its only consumer was message-manager, via a dedicated Jest mapping.
- Every Jest `moduleNameMapper` listed nearly all packages, so `primitives` tests could resolve `broker-message`: an undeclared or inverted import passed silently.
- Several manifests declared internal dependencies that were never imported.

## Decision

1. **`@trading-model/contracts` owns every shared, runtime-free contract.** Types and enums used by more than one package live there, not in `validation` or `common`:

   | Moved to `contracts` | From |
   | --- | --- |
   | `message-types` | `validation/domain/contracts/message.types` |
   | `service-registry-types` | `validation/domain/contracts/service-registry.types` |
   | `dlq-types` | `validation/domain/contracts/dlq.types` |
   | `signed-request` (merged: `HttpRoute`, `SignedRequest`, `Signature`, `Timestamp`, `SignedRequestAuth`) | `validation/domain/contracts/signed-request.types` |
   | `delivery-mode` | `common/config/delivery-mode.types` (needed by `message-types`; `contracts` cannot depend on `common`) |

   The four shims are deleted; consumers import the owning `contracts` module directly. `validation` keeps Zod schemas, env validation and DTOs only. `validation/src/domain/contracts/` no longer exists.

2. **Hard migration, no shims** (same convention as ADR-0007/0015): 83 files across 12 workspaces were re-routed; the tests covering the shims were dropped (already covered in `contracts/tests/unit`), the others moved with their subject.

3. **Test helpers live with their consumer.** `mock-common.ts` was inlined into `message-manager/tests/helpers/broker.helper.ts`; a package never exposes its `tests/` to another workspace.

4. **Manifests are the single source of truth for internal dependencies**, enforced by:
   - `scripts/check-deps.mjs` (`bun run deps:check`, run in the CI `lint` job and the `pre-push` hook): src imports must be in `dependencies`, test imports in `dependencies` or `devDependencies`, no self-import by package name in src, no declared-but-unused internal dependency, no cycle in the `dependencies` graph.
   - `scripts/jest-workspace-mapper.cjs`: every Jest config builds its `@trading-model/*` mapping from its own manifest (own package + declared deps + their transitive runtime deps), so an undeclared package no longer resolves in tests.

   Unused declarations removed: `validation` from `address-manager`, `broker-message` and `crypto`; `contracts` from `server-utils`; `crypto` from `message-manager`; `common` from `admin-interface` (and `http` moved to its `devDependencies`).

## Consequences

### Positive

- One owner per contract; type-only consumers depend on `contracts` (zero-IO, built second) instead of `validation`.
- Build order is no longer implicitly constrained by test-only imports; violations fail fast in CI and on push.
- Jest configs shrink to one line for internal packages and stay in sync with manifests.

### Negative

- Breaking import paths for any out-of-tree consumer of `@trading-model/validation/domain/contracts/*` or `@trading-model/common/config/delivery-mode.types`.
- `admin-interface` (Vitest/Vite aliases) is checked by `deps:check` but its aliases are not generated from the manifest.

### Out of scope

`common/config/services.types` is still a re-export of `primitives/service-instance-name` (71 importers). It should be removed the same way in a follow-up.
