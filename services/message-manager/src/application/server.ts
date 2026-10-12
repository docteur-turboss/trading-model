import { ServiceId } from "@trading-model/common/domain/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import Redis from "ioredis";

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
					if (!process.env.REDIS_URL) {
						return true;
					}
					const client = new Redis(process.env.REDIS_URL, {
						lazyConnect: true,
						maxRetriesPerRequest: 1,
						connectTimeout: 2000,
					});
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
