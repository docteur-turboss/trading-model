import { z } from "zod";

/**
 * How a service reaches Redis. With REDIS_SENTINELS set it goes through the
 * sentinels (HA); REDIS_URL is the single-node fallback for dev and tests.
 * Turned into a connection by `redisConnectionFromEnv` (@trading-model/persistence).
 */
export const RedisEnvSchema = z.object({
	REDIS_URL: z.string().optional(),
	/** `host:port,host:port`, each host an IP address or a DNS name. */
	REDIS_SENTINELS: z.string().optional(),
	REDIS_SENTINEL_MASTER_NAME: z.string().optional(),
	REDIS_PASSWORD: z.string().optional(),
});
