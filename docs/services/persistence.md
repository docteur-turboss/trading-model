# @trading-model/persistence — Redis and MongoDB Plumbing

Connection managers, client factories, store adapters and key builders for Redis and MongoDB. Redis HA (Sentinel) is resolved here from the environment.

## Dependency rule

Depends on `common`, `primitives`, `contracts` plus `ioredis` and `mongodb`. Nothing above it (`http`, `validation`, …) may be imported.

## Main exports

| Import path | Exports | Purpose |
|-------------|---------|---------|
| `@trading-model/persistence/redis-env` | `redisConnectionFromEnv`, `parseRedisNodes`, `RedisEnv` | Builds the connection from `REDIS_SENTINELS` or `REDIS_URL` |
| `@trading-model/persistence/redis-connection-manager` | `createRedisClient`, `createRedisConnectionManager` | Redis client lifecycle |
| `@trading-model/persistence/mongo-connection-manager` | `MongoConnectionManager`, `MongoConnectionConfig` | MongoDB client lifecycle |
| `@trading-model/persistence/redis-key-builder` | `buildRedisKey`, `extendRedisKey`, `RedisKeyBuilder` | Prefixed keys (never `KEYS`) |
| `@trading-model/persistence/store-adapter.interface` | store adapter port | Redis / in-memory stores behind one interface |

## Example

```typescript
import { redisConnectionFromEnv } from "@trading-model/persistence/redis-env";
import { buildRedisKey } from "@trading-model/persistence/redis-key-builder";
```

## See also

[AGENTS.md](../../AGENTS.md) "Databases & migrations", [ADR-0023](../adr/0023-discovery-registry-in-redis.md), [common.md](./common.md).
