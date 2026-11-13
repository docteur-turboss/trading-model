import type { Redis } from "ioredis";

export interface RedisDeps {
	redis: Redis;
	keyPrefix: string;
}
