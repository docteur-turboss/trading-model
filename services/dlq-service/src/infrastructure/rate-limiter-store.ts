import type { Redis } from "ioredis";
import RedisStore from "rate-limit-redis";
import { logger } from "../config/logger";
import { redisClientManager } from "./rate-limiter-redis-client";

export function createRedisStore(): undefined | RedisStore {
	const client = redisClientManager.getOrCreate();
	if (!client) {
		logger.warn(
			"Redis unavailable — rate limiting falls back to per-instance memory store"
		);
		return;
	}
	return _buildStore(client);
}

function _buildStore(client: Redis): RedisStore {
	const sendCommand = (...args: string[]): Promise<number> => {
		return client.call(
			args[0],
			...args.slice(1)
		) as Promise<unknown> as Promise<number>;
	};
	return new RedisStore({ sendCommand });
}
