import type { Redis } from "ioredis";

export interface RedisDeps {
	redis: Redis;
	keyPrefix: string;
	signingSecret: string;
}

export interface RedisDepsWithoutToken {
	redis: Redis;
	keyPrefix: string;
}
