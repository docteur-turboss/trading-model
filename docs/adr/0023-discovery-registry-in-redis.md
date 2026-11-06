# ADR-0023: Discovery Registry Shared Through Redis

**Status:** Accepted
**Date:** 2026-10
**Related:** [ADR-0044](./0044-single-service-resolution-strategy.md) (registry role narrowed), [ADR-0012](./0012-dead-code-removal-and-entrypoint-fix.md) (removed the never-wired Redis "cached registry"), [ADR-0019](./0019-message-broker-as-built.md) (message-manager subscriptions in Redis), [ADR-0020](./0020-database-topology-as-deployed.md)
**Verified by:** `services/discovery-server/tests/unit/discovery-app.spec.ts`, `services/discovery-server/tests/db/redis-instance-store.db.spec.ts`, `services/discovery-server/tests/unit/redis-token-store.spec.ts`, `services/discovery-server/tests/unit/instance-metadata-reader.spec.ts`, `services/discovery-server/tests/unit/service-registry.spec.ts`

## Context

The 13.09 audit asked (Décision 2) whether the discovery registry stays in memory, as it then ran, or moves to Redis, as documented but not wired. The answer chosen: wire Redis, so that discovery survives restarts and runs as several replicas (production: 3, HPA 3–10).

What the code did, in order:

| Date | Commit | Registry | Instance tokens |
| --- | --- | --- | --- |
| 2026-09-13 (audit) | `9348ffe4` | in memory (`new ServiceRegistry()`); `RedisInstanceStore` and the "cached registry" unused | in memory, random secret |
| 2026-09-15 | `1f0990ec` | `RedisInstanceStore` when `REDIS_URL` is set | still a `Map` per process |
| 2026-10-12 | `728fe448` (ADR-0012) | cached registry, cache orchestrator, pub/sub invalidator deleted | unchanged |
| 2026-10-22 → | `031a53bb`, `69fdd599`, then this ADR | `createDiscoveryApp`, Sentinel or `REDIS_URL` | `RedisTokenStore`; `SIGNING_SECRET` mandatory in production |

Between 09-15 and the token store, a heartbeat that reached another replica than the one that registered the instance was rejected (401) and the instance re-registered: several replicas did not work.

The audit finding A6 (`KEYS` on the keyspace, full cache refresh on every heartbeat) targeted the cached registry, which never ran and is gone. `KEYS` remained in `listServiceNames` (lease cleanup cycle, registration, `GET /services`).

## Decision

1. **The registry is in Redis whenever Redis is configured** (`REDIS_SENTINELS`, else `REDIS_URL`, parsed by `redisConnectionFromEnv`): instance set per service, metadata and token per instance under `trading-model:discovery:*`. Every replica reads and writes the same state; any replica accepts any heartbeat. Without Redis, the in-memory store is used: a single replica only (local development, tests).
2. **Tokens are signed with a shared `SIGNING_SECRET`**; discovery refuses to start in production without it.
3. **No keyspace scan.** Service names form a closed set (`ALL_SERVICE_NAMES`): `listServiceNames` reads one `SCARD` per known name.
4. **Heartbeat cost**: token `GET`, `SISMEMBER`, metadata `GET`, one Lua script that writes only while the instance is still registered (so a heartbeat racing the cleaner cannot resurrect it). No cache refresh.
5. **Gauges are recomputed by every replica** at the end of each lease cleanup cycle (`syncRegisteredInstanceMetrics`), for every known service, 0 included. A replica that only counted the registrations it handled would keep a stale value and hide a drop from `InstanceCountLow` (`max by (service)`).
6. **Redis persistence per environment**: K8s staging and production run the `redis` StatefulSet with AOF and snapshots (`deploy/k8s/infra/redis.yaml`); compose keeps snapshots and an AOF switch, `REDIS_APPENDONLY` (default `no` for development; `yes` only if a long-lived development Compose host keeps data you want to survive a restart. Staging and production are Kubernetes-only: a Compose host is never a staging or production target, see [KUBERNETES.md](../deployment/KUBERNETES.md)). `scripts/restore.sh` rebuilds the AOF from the restored snapshot when it is on. Redis content stays derived state (BACKUP_DR): instances register again after a 401.

## Consequences

### Positive

- A discovery restart, rolling update or scale-out keeps every registration and token.
- The registry survives a Redis master failover (Sentinel), within AOF durability.
- No `KEYS`: the cost does not grow with the rest of the keyspace (message-manager subscriptions, dlq-service queue share the same Redis).

### Negative

- Discovery depends on Redis HA: while Redis is unreachable, registrations and heartbeats fail (readiness reports it).
- A new service name must be added to `ServiceInstanceName`; names added only with `registerServiceName` (tests) are not listed.

### Open

- Several replicas are never exercised in CI: staging and kind force 1 replica; `verify_replicas` in `tests/k8s/run-kind.sh` is written but has not run green.
- No pod anti-affinity on `discovery-server` (audit A16): the 3 replicas may share a node.
