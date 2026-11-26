import { svidReadinessCheck } from "@trading-model/http/readiness";
import { createServiceServer } from "@trading-model/http/service-server-factory";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";

/** No business route: the service only reads and sends (ADR-0087). */
export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("decision-consumer"),
		routes: (app: Application) => {
			app.get("/metrics", metricsHandler);
		},
		readiness: [svidReadinessCheck(ENV)],
	});
}
