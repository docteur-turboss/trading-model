import { getLogger } from "@trading-model/contracts/logger-registry";
import { DurationMs } from "@trading-model/primitives/primitives";
import { createRedisClient } from "./redis-connection-manager";
import { type RedisEnv, redisConnectionFromEnv } from "./redis-env";

/**
 * Readiness check `redis` of a service that reads the shared Redis (the bus,
 * ADR-0073): a ping on a fresh client, retried once. Ready when no Redis is
 * configured or the service uses the HTTP bus (`BUS_TRANSPORT=http`). Same
 * shape as `ReadinessCheck` of `@trading-model/http/readiness`.
 */
export function redisReadinessCheck(
	env: RedisEnv & { BUS_TRANSPORT?: "library" | "http" }
) {
	return {
		name: "redis",
		// Two pings of connectTimeout 2 s, under the 5 s probe timeoutSeconds.
		timeoutMs: DurationMs.of(4500),
		check: async (): Promise<boolean> => {
			const connection =
				env.BUS_TRANSPORT === "http" ? undefined : redisConnectionFromEnv(env);
			if (!connection) {
				return true;
			}
			const pingOnce = async () => {
				// Fresh client per attempt, no internal retry.
				const client = createRedisClient(connection, {
					maxRetriesPerRequest: 1,
					connectTimeout: 2000,
					retryStrategy: () => null,
					sentinelRetryStrategy: () => null,
				});
				try {
					await client.connect();
					return (await client.ping()) === "PONG";
				} finally {
					client.disconnect();
				}
			};
			// One isolated connect timeout (CPU-starved runner, issue #725)
			// must not fail the probe; a second failure propagates (503).
			try {
				return await pingOnce();
			} catch (error) {
				// Logged so a Redis failing every other probe stays visible.
				getLogger().warn("Redis readiness ping failed, retrying once", {
					error: error instanceof Error ? error.message : String(error),
				});
				return pingOnce();
			}
		},
	};
}
