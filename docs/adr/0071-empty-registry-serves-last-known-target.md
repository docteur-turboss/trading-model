# ADR-0071: An Empty Registry Answer Serves the Last Known Target for 60 Seconds

**Status:** Accepted
**Date:** 2026-11
**Amends:** [ADR-0045](./0045-single-service-resolution-strategy.md) (§6: last-known target)
**Related:** [ADR-0023](./0023-discovery-registry-in-redis.md), issue #1156, issue #1112
**Verified by:** `packages/address-manager/tests/unit/endpoint-resolver.spec.ts`, `tests/k8s/run-kind.sh`

## Context

`EndpointResolver` served its last known target only when the registry was unreachable. When Redis restarts, discovery-server stays reachable and answers 200 with an empty list until the services re-register (heartbeat failure, then re-registration, a few seconds). The gateway cached `null` and answered 404 for healthy services: the kind upgrade probes lost 1 to 7 requests per job, even when Redis restarted under pods of the new release only (issue #1156, CI run 43625984742). Option 1 of the issue, validated by the owner on 2026-11-14.

## Decision

1. **An empty answer keeps the last known target for 60 s.** When the registry answers but lists no live instance, and the cached target was confirmed by a live instance less than 60 s ago (`EMPTY_REGISTRY_GRACE_MS`), `EndpointResolver.resolve` returns that target and logs a warning. The entry stays expired, so the next call asks the registry again.
2. **After 60 s the empty answer wins**: the resolver caches `null` and the gateway answers 404, as before.
3. **Unchanged:** an unreachable registry still serves the last known target (ADR-0045 §6), `findInstance` (address-manager selection) still reports what the registry says, and Redis still rolls after the Deployments (`deploy-release.sh redis-last`).

## Alternatives Considered

- **Durable registry across a Redis restart** (AOF reload, discovery readiness waiting for re-registration): no routing change, but several hundred lines across `redis.yaml` and discovery-server, and no cover for a Redis that loses its volume. Rejected: cost.
- **Raise `PROBE_MAX_FAILURES` or skip the Redis roll window in the probes**: hides a real user-facing 404. Rejected.
- **Skip the Redis roll when its template is unchanged**: the v3.1.0-rc.1 to rc.2 upgrade changes it (`REDIS_TLS_MODE`). Rejected: does not close the case.

## Consequences

- A service that really deregistered stays routed for up to 60 s after its last live answer; its pods are then gone or unready, so the calls fail at the Service instead of a 404 from the gateway.
- One registry call per gateway request (deduplicated per key) while the registry answers empty within the window.
