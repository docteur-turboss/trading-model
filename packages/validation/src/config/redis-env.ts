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
	REDIS_USERNAME: z.string().optional(),
	REDIS_PASSWORD: z.string().optional(),
	REDIS_SENTINEL_PASSWORD: z.string().optional(),
	/** `optional` (default) or `required`: TLS to Redis (ADR-0047, issue #930). */
	REDIS_TLS_MODE: z.enum(["optional", "required"]).optional(),
	REDIS_TLS_CA: z.string().optional(),
	REDIS_TLS_SERVERNAME: z.string().optional(),
	/** Replicas that must hold a bus write before it is accepted (`WAIT`, ADR-0048): 0 on one node, 1+ with Sentinel. */
	JOURNAL_MIN_REPLICAS: z.coerce.number().int().min(0).default(0),
});

/** Redis settings of a bus service, plus its transport (ADR-0073, read by `busJournalFromEnv`). */
export const BusEnvSchema = RedisEnvSchema.extend({
	/** `library`: Redis Streams in process; `http`: through message-manager; unset: library when Redis is set (N-1 rule). */
	BUS_TRANSPORT: z.enum(["library", "http"]).optional(),
});
