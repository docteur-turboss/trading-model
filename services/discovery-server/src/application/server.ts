import { ServiceId } from "@trading-model/primitives/primitives";
import type { ReadinessCheck } from "@trading-model/server-utils/adapters/inbound/readiness";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { Application } from "express";
import { HEARTBEAT_ROUTES } from "../adapters/inbound/http/heartbeat.routes";
import { REGISTRY_ROUTES } from "../adapters/inbound/http/register.routes";
import type { ServiceRegistry } from "../domain/service-registry";
import { ENV } from "../infrastructure/config/env";
import { metricsHandler } from "../infrastructure/monitoring/metrics";

/** Create and return an HTTPS server with mounted registry and heartbeat routes. */
function _mountDiscoveryRoutes(
	app: Application,
	registry: ServiceRegistry
): void {
	app.get("/metrics", metricsHandler);
	app.use("/", REGISTRY_ROUTES(registry));
	app.use("/", HEARTBEAT_ROUTES(registry));
}

export function createServer(
	registry: ServiceRegistry,
	options?: { readiness?: ReadinessCheck[] }
) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("discovery-server"),
		routes: (app) => _mountDiscoveryRoutes(app, registry),
		readiness: options?.readiness,
	});
}
