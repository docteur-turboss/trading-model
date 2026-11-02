import type Redis from "ioredis";
import type { StoreOptions } from "../../domain/discovery/redis-store-config";

export interface RedisStoreConfig extends StoreOptions {
	redis: Redis;
}
