# ADR-0045: One Service Resolution Strategy: Registry Says Alive, Platform Says Where

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0023](./0023-discovery-registry-in-redis.md) (registry stays, role narrowed), [ADR-0011](./0011-spiffe-spire-workload-identity.md) (unchanged), [ADR-0017](./0017-no-swallowed-errors.md)
**Verified by:** `packages/address-manager/tests/unit/endpoint-resolver.spec.ts`, `packages/address-manager/tests/unit/resolution-equivalence.spec.ts`, `tests/contract/discovery-routes.spec.ts`, `services/api-gateway/tests/unit/server.spec.ts`, `tests/k8s/deploy-release.test.sh`

## Context

Two resolvers coexisted (audit architecture 2026-11-06, A4, issue #503). address-manager asked the registry, then called the Service DNS name. The gateway took the registered IPs, filtered by major version, rotated round-robin and tried several name aliases. The registered IP is the first interface the instance saw, so it can be unreachable from the caller (multi-network compose). The project owner chose option 2 (issue #503, 2026-11-06).

## Decision

1. The registry provides **liveness and major version** only. The platform provides **the address**: `EndpointResolver` (`@trading-model/address-manager/application/discovery/endpoint-resolver`) resolves the canonical Service DNS name to an IPv4 with `dns.lookup`; kube-proxy / compose DNS spread the calls. The registered IP is never a target.
2. The gateway uses that resolver (its own copy is deleted). It still checks the IP against `ALLOWED_PROXY_CIDRS` and selects by major version; both are tested.
3. No round-robin in the client: a failing instance is avoided by K8s readiness, not by the caller. Per-instance targeting (fan-out) needs a headless Service, left to the step 2 ADR.
4. The registry is still asked under each registered alias (`registryNamesFor`); aliases go with issue A10.
5. address-manager's `DiscoveryRetryHandler.lookup` delegates instance selection to `EndpointResolver.findInstance` (registry aliases, optional major version, malformed answers logged), so both callers share one selection path. It keeps its own cache, health check and circuit breaker on top. The address is the canonical Service DNS name in both: the gateway resolves it to an IP (CIDR check), address-manager hands the name to the HTTP client. `lookup(name, majorVersion?)` takes the same optional major version as the gateway; services pass none (any live instance), the gateway the route's. `resolution-equivalence.spec.ts` gives both the same inputs with an unfavourable registry order. `findAllServices` (listing, not selection) still reads `/services/<name>` under the given name only, a deliberate limit: it feeds no routing. `discovery-server` never registers, so `lookup` refuses it (the gateway reaches it by configured URL). The name is `normalizeServiceName`, not `DNS_NAME_MAP`; E2E and the kind smoke test cover compose and K8s.
6. A gateway with no last-known target answers 404 when the registry is unreachable (issue #1112). Closed in depth (owner: option 4): (a) gateway readiness also needs the registry to have answered **once** (`discovery` check, sticky: a later outage never pulls the pod out, the resolver serves its last-known targets); so a gateway that cannot reach discovery at start is not ready, a change of availability accepted; (b) `deploy-release.sh redis-first` applies and waits for the Redis StatefulSets before the rest of the overlay (`deploy.yml` "Apply overlay", `run-kind.sh`), so the previous gateway serves its warm cache during the restart; (c) the sentinel client retries every second at most (`SENTINEL_RETRY_STRATEGY`).
7. Removing discovery-server is out of scope: a later ADR decides it.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Registered IP everywhere | Multi-network compose: unreachable IP; needs a reachable IP published at registration |
| Option 2 and remove discovery-server now | Touches compose, K8s, alerts, runbooks, `reach:check`, bus; too large for step 1 |

## Consequences

- One selection path for every caller (`tests/unit/resolution-equivalence.spec.ts` proves the same target for the same inputs); one HTTP call per cache window, not per alias hit.
- No instance affinity from the gateway.
