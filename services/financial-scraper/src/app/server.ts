import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { FINANCIAL_ROUTES } from "../clients/http/routes";
import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { env } from "../config/env";
import { MessageManagerListenExpress } from "../config/message-manager";

/** Create and return a secure Express server configured with TLS, financial routes, address manager, and message manager. */
export function createServer() {
	return createSecureServer({
		port: env.PORT,
		tls: {
			keyPath: env.TLS_KEY_PATH,
			certPath: env.TLS_CERT_PATH,
			caPath: env.TLS_CA_PATH,
		},
		routes: _registerScraperRoutes,
	});
}

function _registerScraperRoutes(app: import("express").Application): void {
	app.use("/", FINANCIAL_ROUTES());
	ADDRESS_MANAGER_ROUTES(app);
	MessageManagerListenExpress(app);
}
