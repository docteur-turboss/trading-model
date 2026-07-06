import { createSecureServer, buildTlsFromEnv } from "@trading-model/common/server/create-secure-server";
import { Port } from "@trading-model/common/domain/primitives";

import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { ENV } from "../config/env";
import { MESSAGE_MANAGER_ROUTES } from "../config/message-manager";

/** Create and return an HTTPS server with mounted address-manager and message-manager routes. */
export function createServer() {
	return createSecureServer({
		port: Port.of(ENV.PORT),
		tls: buildTlsFromEnv(ENV),
		trustProxy: true,
		routes: mountRoutes,
	});
}

function mountRoutes(app: import("express").Application) {
	ADDRESS_MANAGER_ROUTES(app);
	MESSAGE_MANAGER_ROUTES(app);
}
