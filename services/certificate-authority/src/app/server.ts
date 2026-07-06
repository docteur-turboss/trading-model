import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { ENV } from "../config/env";
import { certificateRoutes } from "../routes/certificate.routes";
import { crlRoutes } from "../routes/crl.routes";
import { healthRoutes } from "../routes/health.routes";

export function createServer() {
	return createSecureServer({
		port: ENV.PORT,
		tls: {
			key: ENV.TLS_KEY_PATH,
			cert: ENV.TLS_CERT_PATH,
			ca: ENV.TLS_CA_PATH,
		},
		routes: (app) => {
			app.use("/", healthRoutes());
			app.use("/api/v1/certificate", certificateRoutes());
			app.use("/api/v1", crlRoutes());
		},
	});
}
