import { createSecureServer } from "@trading-model/common/server/create-secure-server";
import { loadTlsConfig } from "@trading-model/common/server/load-tls-config";

import { ENV } from "../config/env";
import { createRouter } from "../core/router";

export function createServer() {
	return createSecureServer({
		port: ENV.PORT,
		tls: loadTlsConfig(ENV.TLS_KEY_PATH, ENV.TLS_CERT_PATH, ENV.TLS_CA_PATH),
		routes: (app) => {
			app.use("/", createRouter());
		},
	});
}
