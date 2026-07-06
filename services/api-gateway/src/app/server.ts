import { Port } from "@trading-model/common/domain/primitives";
import {
	buildTlsFromEnv,
	createSecureServer,
} from "@trading-model/common/server/create-secure-server";

import { ENV } from "../config/env";
import { createRouter } from "../core/router";

function _mountGatewayRoutes(app: import("express").Application): void {
	app.use("/", createRouter());
}

export function createServer() {
	return createSecureServer({
		port: Port.of(ENV.PORT),
		tls: buildTlsFromEnv(ENV),
		routes: _mountGatewayRoutes,
	});
}
