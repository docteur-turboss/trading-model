import { createServiceServer } from "@trading-model/server-utils/server/service-server-factory";

import { ENV } from "../config/env";
import { DlqRoutes } from "../dlq/routes";

export function createServer() {
	return createServiceServer({
		env: ENV,
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes());
		},
	});
}
