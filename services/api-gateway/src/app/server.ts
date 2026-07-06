import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { ENV } from "../config/env";
import { createRouter } from "../core/router";

export function createServer() {
	return createSecureServer({
		port: ENV.PORT,
		tls: {
			keyPath: ENV.TLS_KEY_PATH,
			certPath: ENV.TLS_CERT_PATH,
			caPath: ENV.TLS_CA_PATH,
		},
		routes: (app) => {
			app.use("/", createRouter());
		},
	});
}
