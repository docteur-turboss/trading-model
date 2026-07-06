import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { env } from "../config/env";
import { DlqRoutes } from "../dlq/routes";

export function createServer() {
	return createSecureServer({
		port: env.PORT,
		tls: {
			key: env.TLS_KEY_PATH,
			cert: env.TLS_CERT_PATH,
			ca: env.TLS_CA_PATH,
		},
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes());
		},
	});
}
