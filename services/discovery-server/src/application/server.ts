import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { ServiceRegistry } from "../domain/service-registry";
import { ENV } from "../infrastructure/config/env";
import { HEARTBEAT_ROUTES } from "../routes/heartbeat.routes";
import { REGISTRY_ROUTES } from "../routes/register.routes";

/** Create and return an HTTPS server with mounted registry and heartbeat routes. */
function _mountDiscoveryRoutes(
	app: import("express").Application,
	registry: ServiceRegistry
): void {
	app.use("/", REGISTRY_ROUTES(registry));
	app.use("/", HEARTBEAT_ROUTES(registry));
}

export function createServer(registry: ServiceRegistry) {
	return createServiceServer({
		env: ENV,
		routes: (app) => _mountDiscoveryRoutes(app, registry),
	});
}
