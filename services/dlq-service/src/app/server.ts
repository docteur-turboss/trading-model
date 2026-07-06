import {
	buildTlsFromEnv,
	createSecureServer,
} from "@trading-model/common/server/create-secure-server";

import { env } from "../config/env";
import { DlqRoutes } from "../dlq/routes";

export function createServer() {
	return createSecureServer({
		port: env.PORT,
		tls: buildTlsFromEnv(env),
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes());
		},
	});
}
