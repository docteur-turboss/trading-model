import type Redis from "ioredis";

export interface StoreOptions {
	prefix: string;
	ttlSec: number;
}

export interface RedisStoreConfig extends StoreOptions {
	redis: Redis;
}
