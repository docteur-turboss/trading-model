# ADR-0047: Redis Isolated Per Service — ACL Users, In-Process Address Cache, In-Memory DLQ Rate Limiter

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0020](./0020-database-topology-as-deployed.md) (topology), [ADR-0023](./0023-discovery-registry-in-redis.md) (registry keys, never `KEYS`), [ADR-0019](./0019-message-broker-as-built.md) (subscriptions in Redis), [ADR-0035](./0035-sealed-secrets-key-daily-backup-by-github-actions.md) (secrets)
**Verified by:** `packages/persistence/tests/db/k8s-redis-ha.db.spec.ts`, `packages/persistence/tests/unit/redis-env.spec.ts`, `bun run config:check`

## Context

Six services shared one Redis HA instance (audit architecture 2026-11-06, A7, issue #506). One outage, failover included, degraded discovery, the bus and the DLQ together, and nothing stopped a service from reading or deleting another's keys. Inventory (`docs/architecture/databases.md`): audit-logger, financial-scraper and trader-trainer used Redis only through address-manager's `RedisServiceCache`; discovery-server, message-manager and dlq-service use it for their own data.

The project owner chose (issue #506, 2026-11-06): ACL users per service (option 1) combined with removing the DLQ rate limiter from Redis (option 3).

## Decision

1. **Address cache in process.** address-manager keeps its service and circuit state in memory per pod (`RedisServiceCache`, `RedisCircuitStateStore` and the scanner are gone). audit-logger, financial-scraper and trader-trainer no longer have `REDIS_*` nor egress to 6379/26379. Each pod sees its own view of addresses; they converge through discovery.
2. **DLQ rate limiter in memory.** `express-rate-limit` default store: the limit holds per pod, not globally (accepted trade-off). `rate-limit-redis` is removed. dlq-service still uses Redis for its `dlq:queue` list (a re-seedable cache of the MongoDB entries, degraded mode without it), so it keeps a user.
3. **One ACL user per remaining service**, created by `deploy/k8s/infra/redis-ha.sh` on every node from the Secret `trading-model-secrets`: `-@all`, the key pattern of the service only and the commands it needs (table in `databases.md`). The `default` user is off. A key outside the pattern or a command outside the list is refused (`NOPERM`).
   - `discovery` → `trading-model:discovery:*`; `message-manager` → `trading-model:message-manager:*`; `dlq-service` → `dlq:queue`.
   - `ha` user (`REDIS_INTERNAL_PASSWORD`): replication (`masteruser`), Sentinel monitoring and probes; reaches no key. Sentinels require the same password (`requirepass`, `sentinel auth-user`/`auth-pass`).
4. **Clients** read `REDIS_USERNAME` (ConfigMap), `REDIS_PASSWORD` (their own key) and `REDIS_SENTINEL_PASSWORD` (`REDIS_INTERNAL_PASSWORD`) through `redisConnectionFromEnv`. Without `REDIS_INTERNAL_PASSWORD` the script sets no ACL (dev, tests); compose runs a single unauthenticated Redis as before.
5. New keys in `trading-model-secrets`: `REDIS_INTERNAL_PASSWORD`, `REDIS_DISCOVERY_PASSWORD`, `REDIS_MESSAGE_MANAGER_PASSWORD`, `REDIS_DLQ_PASSWORD` (`scripts/init-sealed-secrets.sh` generates them).

## Consequences

- Fewer Redis-dependent services (6 → 3); a compromised or buggy service cannot read, overwrite or flush another's data.
- All three services still share one instance: an outage still hits discovery, bus and DLQ queue together (separate instances stay an option, new ADR).
- The sentinel password is shared by the three services (Sentinel has no per-service scope that fits).
- Rollout: the Secret must hold the four keys before the Redis pods restart; pods roll one at a time and a replica starting with ACLs while the master has none (or the opposite) cannot sync until the whole set has rolled, so Redis-backed features run degraded during the rollout. Sealed placeholders in `deploy/k8s/secrets` must be re-sealed (`bash scripts/init-sealed-secrets.sh`).
- A new Redis user means a line in `redis-ha.sh`, a row in `databases.md` and a case in `k8s-redis-ha.db.spec.ts`.

## Alternatives Considered

* Logical databases (db 0/1/2): no security isolation (`SELECT`, `FLUSHDB`).
* A Redis instance per usage: best blast radius, a second HA group to run.
* Keep the DLQ rate limiter shared: needs a fourth reason to stay on Redis.
