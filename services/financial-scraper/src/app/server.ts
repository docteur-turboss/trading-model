import { createServiceServer } from "@trading-model/server-utils/server/service-server-factory";

import { FINANCIAL_ROUTES } from "../clients/http/routes";
import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { ENV } from "../config/env";
import { MessageManagerListenExpress } from "../config/message-manager";

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
