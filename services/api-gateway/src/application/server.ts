import { ServiceId } from "@trading-model/common/domain/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { createRouter } from "../adapters/inbound/router";
import { ENV } from "../infrastructure/config/env";

function _mountGatewayRoutes(app: import("express").Application): void {
	app.use("/", createRouter());
}

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("api-gateway"),
		routes: _mountGatewayRoutes,
	});
}
