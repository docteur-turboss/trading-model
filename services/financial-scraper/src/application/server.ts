import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";

import { FINANCIAL_ROUTES } from "../clients/http/routes";
import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { MessageManagerListenExpress } from "../config/message-manager";
import { ENV } from "../infrastructure/config/env";

function _registerScraperRoutes(app: import("express").Application): void {
	app.use("/", FINANCIAL_ROUTES());
	ADDRESS_MANAGER_ROUTES(app);
	MessageManagerListenExpress(app);
}

/** Create and return a secure Express server configured with TLS, financial routes, address manager, and message manager. */
export function createServer() {
	return createServiceServer({
		env: ENV,
		routes: _registerScraperRoutes,
	});
}
