import { createServiceServer } from "@trading-model/http/service-server-factory";
import { redisReadinessCheck } from "@trading-model/persistence/redis-readiness";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";

import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
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
		readiness: [redisReadinessCheck(ENV)],
	});
}
