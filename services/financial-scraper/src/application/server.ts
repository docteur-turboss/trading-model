import { ServiceId } from "@trading-model/common/domain/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";

import { FINANCIAL_ROUTES } from "../clients/http/routes";
import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { DATABASE } from "../config/db";
import { MessageManagerListenExpress } from "../config/message-manager";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";

function _registerScraperRoutes(app: import("express").Application): void {
	app.use("/", FINANCIAL_ROUTES());
	app.get("/metrics", metricsHandler);
	ADDRESS_MANAGER_ROUTES(app);
	MessageManagerListenExpress(app);
}

/** Create and return a secure Express server configured with TLS, financial routes, address manager, and message manager. */
export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("financial-scraper"),
		routes: _registerScraperRoutes,
		readiness: [
			{
				name: "mysql",
				check: async () => {
					try {
						await DATABASE.query("SELECT 1");
						return true;
					} catch {
						return false;
					}
				},
			},
		],
	});
}
