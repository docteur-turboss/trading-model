import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { Application } from "express";
import { createRouter } from "../adapters/inbound/router";
import { discoveryClient } from "../config/container";
import { ENV } from "../infrastructure/config/env";

function _mountGatewayRoutes(app: Application): void {
	app.use("/", createRouter());
}

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("api-gateway"),
		routes: _mountGatewayRoutes,
		readiness: [
			{
				name: "discovery",
				check: async () => {
					await discoveryClient.get(
						URLString.of(`${ENV.DISCOVERY_SERVICE_URL}/ping`)
					);
					return true;
				},
			},
		],
	});
}
