import { createServiceServer } from "@trading-model/server-utils/server/service-server-factory";

import { ENV } from "../config/env";
import { createRouter } from "../core/router";

function _mountGatewayRoutes(app: import("express").Application): void {
	app.use("/", createRouter());
}

export function createServer() {
	return createServiceServer({
		env: ENV,
		routes: _mountGatewayRoutes,
	});
}
