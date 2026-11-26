# ADR-0072: Route on Service DNS Names, Majors Served by the Services, Retire discovery-server

**Status:** Accepted
**Date:** 2026-11
**Supersedes:** ADR-0023 (deleted), ADR-0045 (deleted), ADR-0071 (deleted)
**Related:** [ADR-0046](./0046-simplification-trajectory.md) (step 2), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md) (expand/contract), [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md) (route registries), [ADR-0029](./0029-orphan-subsystems-retired-and-reachability-gate.md), issues #1202, #1208, #1112, #1156
**Verified by:** `services/api-gateway/tests/unit/router.spec.ts`, `services/api-gateway/tests/unit/public-routes.spec.ts`, `packages/address-manager/tests/unit/address-manager.spec.ts`, `packages/http/tests/unit/adapters/inbound/api-route.spec.ts`, `bun run api:check`

## Context

Since ADR-0045 the address of a service already came from the platform DNS (Kubernetes Service, compose service name); discovery-server's registry only said whether a major version was alive. Pod readiness already removes a dead pod from its Service, so the registry duplicated it and added its own failures: a Redis restart emptied it and the gateway answered 404 for healthy services (issues #1112, #1156; ADR-0071 and the `redis-last` rollout order only softened it).

The owner accepted the retirement of discovery-server (ADR-0046 step 2, issue #1202) and chose where the major API version lives (issue #1208, "option 5"): in the services themselves, not in the registry, nor in a Service name, nor in a static gateway table.

## Decision

1. **Address = DNS name.** The gateway resolves the canonical service name (`normalizeServiceName`) to an IP with the platform resolver, checks it against `ALLOWED_PROXY_CIDRS`, and proxies to port 3000. A name that does not resolve answers 503. Services find each other the same way (`AddressManager.findService`: DNS name, or `DNS_NAME_MAP` outside Docker and Kubernetes, port 3000; the gateway does not read `DNS_NAME_MAP`). No registry is asked, no instance is picked: kube-proxy and compose DNS spread the connections over ready pods; calls follow their keep-alive connection (`keepAlive: true`, `packages/http/src/http-utils.ts`), so the spread is per connection, not per call (the canary bias of issue #724). A GET answered from the gateway's response cache needs no lookup. The address-manager's instance cache, health checker and circuit breaker go (the shared HTTP client keeps its own breaker).
2. **Majors are served by the services.** A public route's registry entry carries its major as the first segment of its path (`v2` for the scraper's candles route). A service mounts one route per major it supports and answers 404 to the others. The gateway's `PUBLIC_ROUTES` lists the public routes per major (`GET /v2/financial-scraper/candles/symbols/:symbol`); a major not listed answers 404 before any proxying. The OpenAPI follows from `PUBLIC_ROUTES` (`bun run api:write`). `APP_VERSION` no longer sets the gateway prefix.
3. **Deprecation window.** When a service ships major N+1 of a route, major N stays in its registry and in `PUBLIC_ROUTES` for one more release, then is removed.
4. **Service-to-service routes are not versioned.** They are internal, called by code released with the target, and guarded by the contract tests (`bun run test:contract`).
5. **Readiness** of the gateway no longer depends on the registry (SVID only). Release N kept a `discovery-registration` readiness check so a pod was not Ready before N-1 gateways could find it in the registry; N+1 removed it with discovery-server.

### Two releases (ADR-0040)

- **Release N (expand):** everything above. The gateway still forwards the path without `/v<major>`, and `mountRoute` also mounts each versioned public route without its major, so N-1 gateways and N-1 services keep working during the rollout. Services still register, heartbeat and gate their readiness on the registration, and discovery-server still runs, for N-1 gateways only; nothing in N reads the registry. discovery's public registry routes stayed, marked `deprecated` in the OpenAPI (deprecation window of point 3), and went in N+1.
- **Release N+1 (contract, done, issue #1244):** the gateway forwards `/v<major><path>`; `mountRoute` keeps the unversioned alias until a release with the `/v<major>` gateway is N-1 (#2048 removed it in the same release as the gateway change, #2531 put it back, #2587 removes it); callers of a public route (trainer → scraper candles, model-evaluator → trainer manifests) use the versioned path; discovery-server, the register/heartbeat/token calls of address-manager, its manifests, SPIRE entries, compose service, alerts, dashboards and runbooks are deleted. The ACL user `discovery`, its ingress in the Redis NetworkPolicy and the Secret keys `REDIS_DISCOVERY_PASSWORD` and `SIGNING_SECRET` stay so a rollback to v3.1.0 finds them (no rollback restores a NetworkPolicy or a Secret); they go in N+2 (issue #2494). The `redis-last` rollout order of `deploy-release.sh` stays: it also protects the bus journal.

## Consequences

- No more 404 on healthy services when Redis restarts; the gateway's routing has no stateful dependency.
- Two majors of a service can run side by side in the same pods, which neither the registry nor a single Service name allowed.
- A major bump is a code change (registry paths, `PUBLIC_ROUTES`, OpenAPI), reviewed like any other; forgetting the old major's removal leaves a route the deprecation window says to delete.
- Callers lose per-instance circuit breaking; the platform only routes new connections to ready pods, and the HTTP client's breaker still fails fast on a failing service.
- Release N kept discovery-server running with nothing reading it; N+1 deleted it.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Keep discovery-server (ADR-0046 step 2 refused) | Duplicates readiness and caused the 404s of #1112 and #1156 (owner, #1202) |
| Major in a static gateway table | One major per service at a time; frequent majors expected (owner, #1208) |
| Major in the Service name (`<svc>-v3`) | Renames Services, NetworkPolicies, SPIFFE IDs and certificates for each major |
| Ignore the major | Loses "a requested major is a served major" |
| Remove discovery-server in one release | N-1 gateways would answer 404 during the rollout (ADR-0040) |
