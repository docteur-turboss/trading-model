import { NULL_CACHE } from "./null-cache";
import { RealRedisCache } from "./real-redis-cache";

export { NULL_CACHE } from "./null-cache";
export { RealRedisCache } from "./real-redis-cache";
export type {
	CacheOptions,
	CacheSetEntry,
	RedisCache,
} from "./redis-cache.types";

export function createCache(redisUrl?: string) {
	return redisUrl ? new RealRedisCache(redisUrl) : NULL_CACHE;
}
