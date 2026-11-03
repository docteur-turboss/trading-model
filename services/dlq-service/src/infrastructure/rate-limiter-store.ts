import type { Redis } from "ioredis";
import RedisStore from "rate-limit-redis";
import { logger } from "../config/logger";
import { redisClientManager } from "./rate-limiter-redis-client";

/**
 * Each limiter needs its own `prefix`: the store keys counters by client
 * address only, so limiters sharing the default `rl:` would add up their hits
 * and keep the window (PX) of whichever limiter counted first.
 */
export function createRedisStore(prefix: string): undefined | RedisStore {
	const client = redisClientManager.getOrCreate();
	if (!client) {
		logger.warn(
			"Redis unavailable — rate limiting falls back to per-instance memory store"
		);
		return;
	}
	return _buildStore(client, prefix);
}

function _buildStore(client: Redis, prefix: string): RedisStore {
	const sendCommand = (...args: string[]): Promise<number> => {
		return client.call(
			args[0],
			...args.slice(1)
		) as Promise<unknown> as Promise<number>;
	};
	return new RedisStore({ sendCommand, prefix });
}
