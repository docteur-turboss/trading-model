import {
	buildTlsFromEnv,
	createSecureServer,
} from "@trading-model/server-utils/server/create-secure-server";

import { ENV } from "../config/env";
import { DlqRoutes } from "../dlq/routes";

export function createServer() {
	return createSecureServer({
		port: ENV.PORT,
		tls: buildTlsFromEnv(ENV),
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes());
		},
	});
}
