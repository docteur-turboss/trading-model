import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { env } from "../config/env";
import { DlqRoutes } from "../dlq/routes";

export function createServer() {
	return createSecureServer({
		port: env.PORT,
		tls: {
			keyPath: env.TLS_KEY_PATH,
			certPath: env.TLS_CERT_PATH,
			caPath: env.TLS_CA_PATH,
		},
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes());
		},
	});
}
