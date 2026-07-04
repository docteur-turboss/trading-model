import { createSecureServer } from "@trading-model/common/server/create-secure-server";
import { loadTlsConfig } from "@trading-model/common/server/load-tls-config";

import { env } from "../config/env";
import { DlqRoutes } from "../dlq/routes";

export function createServer() {
	return createSecureServer({
		port: env.PORT,
		tls: loadTlsConfig(env.TLS_KEY_PATH, env.TLS_CERT_PATH, env.TLS_CA_PATH),
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes());
		},
	});
}
