import { Port } from "@trading-model/common/domain/primitives";
import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { ENV } from "../config/env";
import { createRouter } from "../core/router";

function _mountGatewayRoutes(app: import("express").Application): void {
	app.use("/", createRouter());
}

export function createServer() {
	return createSecureServer({
		port: Port.of(ENV.PORT),
		tls: {
			keyPath: ENV.TLS_KEY_PATH,
			certPath: ENV.TLS_CERT_PATH,
			caPath: ENV.TLS_CA_PATH,
		},
		routes: _mountGatewayRoutes,
	});
}
