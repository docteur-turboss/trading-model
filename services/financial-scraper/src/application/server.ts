import { ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { Application } from "express";

import { FINANCIAL_ROUTES } from "../adapters/inbound/http/routes";
import {
	ADDRESS_MANAGER_ROUTES,
	REGISTRATION_READINESS,
} from "../config/address-manager";
import { DATABASE } from "../config/db";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";

function _registerScraperRoutes(app: Application): void {
	app.use("/", FINANCIAL_ROUTES());
	app.get("/metrics", metricsHandler);
	ADDRESS_MANAGER_ROUTES(app);
}

/**
 * Secure Express server: financial routes, address manager, metrics. The
 * scraper only publishes, so it mounts no broker callback (`POST /message`):
 * it subscribes to nothing and message-manager never delivers to it.
 */
export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("financial-scraper"),
		routes: _registerScraperRoutes,
		readiness: [
			REGISTRATION_READINESS,
			{
				name: "mysql",
				check: async () => {
					// The callback pool's query() returns no promise: awaiting it
					// never surfaced the result and readiness stayed down.
					await DATABASE.promise().query("SELECT 1");
					return true;
				},
			},
		],
	});
}
