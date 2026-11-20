import { svidReadinessCheck } from "@trading-model/http/readiness";
import { createServiceServer } from "@trading-model/http/service-server-factory";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import { createRouter } from "../adapters/inbound/router";
import { ENV } from "../infrastructure/config/env";

function _mountGatewayRoutes(app: Application): void {
	app.use("/", createRouter(ENV));
}

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("api-gateway"),
		routes: _mountGatewayRoutes,
		readiness: [svidReadinessCheck(ENV)],
	});
}
