import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { ENV } from "../config/env";
import { createRouter } from "../core/router";

export function createServer() {
	return createSecureServer({
		port: ENV.PORT,
		tls: {
			key: ENV.TLS_KEY_PATH,
			cert: ENV.TLS_CERT_PATH,
			ca: ENV.TLS_CA_PATH,
		},
		routes: (app) => {
			app.use("/", createRouter());
		},
	});
}
