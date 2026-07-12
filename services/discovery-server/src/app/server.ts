import { Port } from "@trading-model/common/domain/primitives";
import {
	buildTlsFromEnv,
	createSecureServer,
} from "@trading-model/server-utils/server/create-secure-server";

import { ENV } from "../config/env";
import type { ServiceRegistry } from "../core/service-registry";
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
	return createSecureServer({
		port: Port.of(ENV.PORT),
		tls: buildTlsFromEnv(ENV),
		routes: (app) => _mountDiscoveryRoutes(app, registry),
	});
}
