import type { URLString } from "@trading-model/common/domain/primitives";
import { NULL_CACHE } from "./null-cache";
import { RealRedisCache } from "./real-redis-cache";

export { NULL_CACHE } from "./null-cache";
export { RealRedisCache } from "./real-redis-cache";
export type {
	CacheOptions,
	RedisCache,
} from "./redis-cache.types";

export function createCache(redisUrl?: URLString) {
	return redisUrl ? new RealRedisCache(redisUrl) : NULL_CACHE;
}
