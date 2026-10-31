import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import { redisConnectionFromEnv } from "@trading-model/persistence/redis-env";
import { ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type Redis from "ioredis";

import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { MESSAGE_MANAGER_ROUTES } from "../config/message-manager";
import { ENV } from "../infrastructure/config/env";

function mountRoutes(app: import("express").Application) {
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
			{
				name: "redis",
				check: async () => {
					const connection = redisConnectionFromEnv(ENV);
					if (!connection) {
						return true;
					}
					// One attempt per check: the next probe retries.
					const client = createRedisClient(connection, {
						maxRetriesPerRequest: 1,
						connectTimeout: 2000,
						retryStrategy: () => null,
						sentinelRetryStrategy: () => null,
					}) as Redis;
					// biome-ignore lint/plugin: readiness probe: failure is the negative signal
					try {
						await client.connect();
						return (await client.ping()) === "PONG";
					} catch {
						return false;
					} finally {
						client.disconnect();
					}
				},
			},
		],
	});
}
