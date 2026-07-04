import { createSecureServer } from "@trading-model/common/server/create-secure-server";
import { loadTlsConfig } from "@trading-model/common/server/load-tls-config";

import { ENV } from "../config/env";
import type { ServiceRegistry } from "../core/service-registry";
import { HEARTBEAT_ROUTES } from "../routes/heartbeat.routes";
import { REGISTRY_ROUTES } from "../routes/register.routes";

/** Create and return an HTTPS server with mounted registry and heartbeat routes. */
export function createServer(registry: ServiceRegistry) {
	return createSecureServer({
		port: ENV.PORT,
		tls: loadTlsConfig(ENV.TLS_KEY_PATH, ENV.TLS_CERT_PATH, ENV.TLS_CA_PATH),
		routes: (app) => {
			app.use("/", REGISTRY_ROUTES(registry));
			app.use("/", HEARTBEAT_ROUTES(registry));
		},
	});
}
