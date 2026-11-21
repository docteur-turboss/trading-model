import { svidReadinessCheck } from "@trading-model/http/readiness";
import { createServiceServer } from "@trading-model/http/service-server-factory";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import { createRouter } from "../adapters/inbound/router";
import { ENV } from "../infrastructure/config/env";

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("api-gateway"),
		routes: (app: Application) => app.use("/", createRouter(ENV)),
		readiness: [svidReadinessCheck(ENV)],
	});
}
