import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { ENV } from "../config/env";
import { MESSAGE_MANAGER_ROUTES } from "../config/message-manager";

/** Create and return an HTTPS server with mounted address-manager and message-manager routes. */
export function createServer() {
	return createSecureServer({
		port: ENV.PORT,
		tls: tlsConfig(),
		trustProxy: true,
		routes: mountRoutes,
	});
}

function tlsConfig() {
	return {
		keyPath: ENV.TLS_KEY_PATH,
		certPath: ENV.TLS_CERT_PATH,
		caPath: ENV.TLS_CA_PATH,
	};
}

function mountRoutes(app: ReturnType<typeof import("express")>) {
	ADDRESS_MANAGER_ROUTES(app);
	MESSAGE_MANAGER_ROUTES(app);
}
