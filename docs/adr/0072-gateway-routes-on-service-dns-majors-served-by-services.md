# ADR-0072: The Gateway Routes on the Service DNS Name, Each Service Serves Its API Majors

**Status:** Accepted
**Date:** 2026-11
**Supersedes:** [ADR-0071](./0071-empty-registry-serves-last-known-target.md)
**Amends:** [ADR-0045](./0045-single-service-resolution-strategy.md) (§2 and §6: the gateway no longer asks the registry)
**Related:** [ADR-0046](./0046-simplification-trajectory.md) (step 2), [ADR-0023](./0023-discovery-registry-in-redis.md), [ADR-0040](./0040-locked-resumable-migrations-and-expand-contract.md), [ADR-0021](./0021-http-api-schemas-and-generated-openapi.md), issue #1208, issue #1202
**Verified by:** `services/api-gateway/tests/unit/router.spec.ts`, `services/api-gateway/tests/unit/public-routes.spec.ts`, `services/api-gateway/tests/unit/server.spec.ts`, `packages/server-utils/tests/create-secure-server.spec.ts`, `bun run api:check`

## Context

Since ADR-0045 the address of a service comes from DNS and its liveness from pod readiness. The gateway still asked discovery-server whether the route's major version was alive before calling the Service DNS name. A Redis restart emptied the registry and the gateway answered 404 for healthy services (issues #1112, #1156); ADR-0071 and the `redis-last` rollout order only narrowed the window. The major version was the registry's last job, and all services ran one major each (`APP_VERSION`, set by hand per service).

The owner accepted retiring discovery-server (issue #1202, ADR-0046 step 2) and chose "option 5" in issue #1208 (2026-11-15): the gateway forwards `/v<n>/…` and no longer consults the registry, each service mounts one router per major it supports and answers 404 to the others, an old major is removed after a deprecation period, `PUBLIC_ROUTES` lists the routes by version and the OpenAPI follows.

## Decision

1. **The gateway never asks the registry.** The canonical service name is its DNS name (K8s Service, compose service): the gateway resolves it to an IPv4 on port 3000, keeps the `ALLOWED_PROXY_CIDRS` check, and answers 503 when the name does not resolve. Its readiness is the SVID only. `EndpointResolver.resolve` and the 60 s last-known target of ADR-0071 are deleted.
2. **`PUBLIC_ROUTES` lists every public route with its major**: `METHOD /v<major>/<service>/<path>`. Another major answers 404 at the gateway. `scripts/api-contract.mjs` generates the OpenAPI paths and version from that list.
3. **Each service serves its majors** under `/v<major>`: `apiVersions` of `createServiceServer` (`apiVersionPrefix`). Another `/v<n>` answers 404. Bare paths stay for service-to-service calls and probes. `api:check` fails when a `PUBLIC_ROUTES` major is not in the service's `apiVersions`. Today the routes of every served major are the same; the first major whose routes differ gives that major its own routes in the same change.
4. **Deprecation: one release.** When a release introduces major `n+1` of a service, major `n` stays served for one more release, then its `PUBLIC_ROUTES` entries and its `apiVersions` value are removed together.
5. **Expand/contract (ADR-0040).** This release: services serve `/v<major>`, the gateway resolves by DNS and still forwards the path without the prefix, because N-1 services only serve bare paths. Next release: the gateway forwards `/v<major>/<path>` unchanged. The address-manager clients stop calling the registry in their own release, then discovery-server, its Redis keyspace, its ACL user and its manifests are removed; that last step supersedes ADR-0023 and what remains of ADR-0045.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Static table of majors in the gateway (option 1 of #1208) | Frequent majors expected: one table to keep in step with every service, and two majors of one service still need two Services. |
| Major in the Service name, `<svc>-v<n>` (option 2) | Renames every Service, NetworkPolicy, SPIFFE ID and certificate for each major. |
| No major at all (option 3) | Loses "a requested version is a served version". |
| Gateway forwards the prefix in this release already | An N-1 service behind a new gateway (rollout, canary) answers 404 to every public call. |

## Consequences

- A Redis restart or an empty registry no longer turns a healthy service into a 404 at the gateway; a service with no ready pod fails at the Service (503).
- `APP_VERSION` now only feeds the registry and telemetry; the public major lives in code (`PUBLIC_ROUTES` and `apiVersions`).
- Until discovery-server is removed, the address-manager clients still use the registry, and `deploy-release.sh redis-last` stays for them and for the message journal.
