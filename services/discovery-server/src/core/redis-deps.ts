import type { Redis } from "ioredis";
import type { RedisKeyBuilder } from "./redis-key-builder";
import type { TokenService } from "./token-service";

export interface RedisDeps {
	redis: Redis;
	keyBuilder: RedisKeyBuilder;
	tokenService: TokenService;
}

export interface RedisDepsWithoutToken {
	redis: Redis;
	keyBuilder: RedisKeyBuilder;
}
