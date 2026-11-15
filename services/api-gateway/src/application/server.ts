import { ServiceId } from "@trading-model/primitives/primitives";
import { svidReadinessCheck } from "@trading-model/server-utils/readiness";
import { createServiceServer } from "@trading-model/server-utils/service-server-factory";
import type { Application } from "express";
import { createRouter } from "../adapters/inbound/router";
import { ENV } from "../infrastructure/config/env";

function _mountGatewayRoutes(app: Application): void {
	app.use("/", createRouter());
}

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("api-gateway"),
		routes: _mountGatewayRoutes,
		readiness: [svidReadinessCheck(ENV)],
	});
}
