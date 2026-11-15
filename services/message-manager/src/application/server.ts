import { logger } from "@trading-model/http/infrastructure/logger";
import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import { redisConnectionFromEnv } from "@trading-model/persistence/redis-env";
import { DurationMs, ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { Application } from "express";

import {
	ADDRESS_MANAGER_ROUTES,
	REGISTRATION_READINESS,
} from "../config/address-manager";
import { MESSAGE_MANAGER_ROUTES } from "../config/message-manager";
import { ENV } from "../infrastructure/config/env";

function mountRoutes(app: Application) {
	ADDRESS_MANAGER_ROUTES(app);
	MESSAGE_MANAGER_ROUTES(app);
}

/** Create and return an HTTPS server with mounted address-manager and message-manager routes. */
export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("message-manager"),
		trustProxy: true,
		routes: mountRoutes,
		readiness: [
			REGISTRATION_READINESS,
			{
				name: "redis",
				// Two pings of connectTimeout 2 s, under the 5 s probe timeoutSeconds.
				timeoutMs: DurationMs.of(4500),
				check: async () => {
					const connection = redisConnectionFromEnv(ENV);
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
						logger.warn("Redis readiness ping failed, retrying once", {
							error: error instanceof Error ? error.message : String(error),
						});
						return pingOnce();
					}
				},
			},
		],
	});
}
