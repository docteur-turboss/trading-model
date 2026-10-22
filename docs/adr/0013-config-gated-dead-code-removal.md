# ADR-0013: Removal of Configuration-Gated Dead Code Missed by Import Reachability (address-manager Discovery WebSocket Client)

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) (reachability analysis whose limitation this ADR addresses, and which removed the matching discovery WebSocket **server**), [ADR-0010](./0010-clean-architecture-migration.md) (layering conventions relied on by the removal)

## Context

[ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) removed the code that was unreachable from the real runtime entrypoints, based on a **static import reachability analysis**. That method reasons on the **import graph**: a file is dead when nothing reachable imports it.

This method has a blind spot. Code that is **imported but never activated at runtime** — because a **configuration flag is never set** to the value that would enable it — still has a valid import edge from a reachable module. It therefore appears "reachable" and escapes the ADR-0012 analysis entirely. The module, its factory, its wiring and its tests stay alive while the feature is effectively never exercised in any real deployment.

A subsequent **value-aware audit** (reasoning about configuration values, not only imports) found exactly one such residue in the monorepo: the **discovery WebSocket client** in `packages/address-manager`. It is the client-side counterpart of the discovery WS **server** that ADR-0012 already removed, and it is gated behind `WS_URL`, a configuration value that is never satisfied.

### Evidence

- `packages/address-manager/src/adapters/outbound/ws-client.factory.ts`: `maybeCreateWsClient()` returns `undefined` when `config.wsUrl` is absent (around lines 77–83).
- `packages/address-manager/src/application/create-address-manager.ts` (around line 74): wires `wsUrl: env.WS_URL` and `wsSubscribedServices` from `env.WS_SUBSCRIBED_SERVICES`.
- `WS_URL` / `WS_SUBSCRIBED_SERVICES` are **defined in no `.env.example`, no `docker-compose.yml`, and no k8s manifest** (grep shows 0 occurrences outside the package itself and its own tests). Therefore `config.wsUrl` is always `undefined` in real deployments, and the WS client is never instantiated — the factory short-circuits before any socket is created.
- The server on the other side (the `discovery-server` WebSocket server) was **removed by ADR-0012**, so even a wired client would have no peer.
- An orphan audit confirms the residue is not an import orphan: **0 / 780 `src/` files** are referenced only by tests. The client is imported by reachable modules, which is precisely why import reachability could not see it — it is code **frozen by configuration**, invisible to the ADR-0012 method.

## Decision

**Remove** the discovery WebSocket client subsystem from `@trading-model/address-manager` and its now-unused WebSocket plumbing in `@trading-model/common` and `@trading-model/validation`. This is consistent with the "WSS transport" reintroduction condition already established by ADR-0012: such transports should only be reintroduced if a real need for **server-initiated push** emerges.

### Source files removed

| File | Rationale |
| ---- | --------- |
| `packages/address-manager/src/adapters/outbound/client/websocket-client.ts` | The WS client implementation; only reachable through the config-gated factory. |
| `packages/address-manager/src/adapters/outbound/ws-client.factory.ts` | `maybeCreateWsClient()` short-circuits to `undefined` because `config.wsUrl` is never set. |
| `packages/address-manager/src/application/ws-auth-failure-handler.ts` | Only referenced by the WS client stack. |
| `packages/address-manager/src/infrastructure/client/ws-connection.ts` | Connection transport used only by the WS client. |
| `packages/common/src/ws/base-ws-connection.ts` | Shared WS base used only by the removed client stack. |
| `packages/common/src/ws/default-ws-reconnector.ts` | Reconnection strategy used only by the removed client stack. |
| `packages/common/src/ws/i-ws-connection.ts` | Interface for the removed connection. |
| `packages/common/src/ws/i-ws-reconnector.ts` | Interface for the removed reconnector. |
| `packages/common/src/ws/ws-close-codes.ts` | Close-code constants used only by the removed stack. |
| `packages/validation/src/adapters/inbound/discovery-ws-message.types.ts` | `DiscoveryWsMessageType` types for the removed discovery WS protocol. |

### Source files edited (plumbing removed)

Remove the `wsClient` / `wsUrl` / `WS_URL` / `WS_SUBSCRIBED_SERVICES` / `DiscoveryWsMessageType` plumbing only; no behavioural change to the remaining (HTTP-based) code paths:

- `packages/address-manager/src/application/types.ts` — remove `wsClient` from `ServiceClientDeps` / `ShutdownHandlerDeps` / `LifecycleDeps`.
- `packages/address-manager/src/application/address-manager-factory.ts` — remove `buildWsClient` and its wiring.
- `packages/address-manager/src/application/lifecycle-manager.ts` (and `lifecycle-builder.ts`).
- `packages/address-manager/src/application/heartbeat-manager.ts`, `heartbeat-failure-handler.ts`, `registration-attempt-handler.ts`, `registration-heartbeat-builder.ts`.
- `packages/address-manager/src/infrastructure/shutdown-handler.ts`.
- `packages/address-manager/src/infrastructure/config/address-manager-env.ts` — remove `WS_URL`, `WS_SUBSCRIBED_SERVICES`, `resolveWsSubscribedServices`.
- `packages/address-manager/src/domain/config/address-manager-config.ts` — remove `wsUrl`, `wsSubscribedServices`.
- `packages/address-manager/package.json` and `packages/common/package.json` — remove the `./ws/*` export subpath and the `ws` dependency (plus `@types/ws`) once no other usage remains in `common`.

### Tests removed

- `packages/address-manager/tests/unit/websocket-client.spec.ts`
- `packages/address-manager/tests/unit/ws-connection.spec.ts`
- `packages/common/tests/unit/ws/base-ws-connection.spec.ts`
- `packages/common/tests/unit/ws/default-ws-reconnector.spec.ts`
- WS cases in `packages/address-manager/tests/unit/address-manager.spec.ts`, `packages/address-manager/tests/unit/create-address-manager.spec.ts`, and the `DiscoveryWsMessageType` block in `packages/validation/tests/event-enums.spec.ts`.

## Alternatives Considered

| Alternative | Reason for Rejection |
| ----------- | -------------------- |
| Keep the WS client behind the `WS_URL` flag | This is precisely what let it rot unobserved: a flag that is never set in any deployment means no runtime consumer, no signal when dependencies or protocols change, and a permanently untested path carried with full tests and docs |
| Actually wire the client (set `WS_URL` in deployments) | No concrete requirement for server-initiated push exists, and the counterpart discovery WS **server** was removed by ADR-0012 — a wired client would have no peer |
| Mark the subsystem with `@dead` annotations or coverage-only exclusion | Keeps the maintenance and cognitive load; the point of the removal is to shrink the surface, not to label it |
| Leave it and rely on the ADR-0012 import analysis to catch it later | The import analysis cannot see config-gated code by construction; it reported the package clean, which is exactly the false negative this ADR corrects |

## Consequences

### Positive

- Smaller maintenance surface: the discovery WS client stack (~10 `src/` files), its shared plumbing in `common`/`validation`, and ~4 spec files plus the WS test cases are removed.
- The `ws` dependency (and `@types/ws`) is dropped from `common` and `address-manager`, and the `./ws/*` export subpath disappears — fewer third-party dependencies and faster CI.
- The architecture is again readable from the code: address-manager talks to discovery over HTTP only, matching the HTTP-only discovery documented in ADR-0012.
- The config-gated dead-code class is now explicitly documented, so the same blind spot is recognized in future audits.

### Negative

- Reintroducing the discovery WS client requires a **rewrite**, not a re-wire; git history is the recovery path.
- The removal does not by itself prevent new config-gated dead code: the underlying detection gap (import analysis vs. runtime activation) remains unless a value-aware check is added.

### Mitigations

- Reintroduction conditions are documented below, tied to measurable triggers and to the ADR-0012 "WSS transport" trigger.
- Git history preserves the removed client implementation for reference.
- A **value-aware CI guard** is recommended (see below) so that configuration flags that are never satisfiable in any deployment are detected the same way ADR-0012 detects import orphans.

## Conditions for Reintroduction

The discovery WebSocket client may be reintroduced only when **both**:

1. the ADR-0012 **"WSS transport"** condition holds — a concrete requirement for server-initiated push / real-time updates arrives (e.g. streaming subscriptions with sub-second latency) and polling/webhook proves insufficient; **and**
2. a discovery WebSocket **server** is reintroduced on the other side (removed by ADR-0012), and `WS_URL` (with `WS_SUBSCRIBED_SERVICES`) is explicitly configured in `.env.example`, `docker-compose.yml`, and the k8s manifests.

Any reintroduction must wire the client into a **runtime entrypoint** and be covered by the reachability analysis without appearing as dead code — and the new configuration flags must be **value-reachable** in at least one real deployment profile.

## Recommendation: Value-Aware Detection in CI

The ADR-0012 reachability gate operates on the **import graph** and cannot detect code that is imported but never activated. This ADR shows that class is real and non-empty. To close the gap, a **value-aware** check should complement the import analysis: for every configuration flag read by the code (e.g. `WS_URL`), assert that the flag is either (a) defined in at least one deployment profile (`.env.example` / `docker-compose.yml` / k8s manifests) or (b) acknowledged as intentionally optional. Flags with **no definition anywhere** are candidates for removal — the same signal used to identify the discovery WS client here. This guard should be added alongside, not instead of, the existing reachability analysis.
