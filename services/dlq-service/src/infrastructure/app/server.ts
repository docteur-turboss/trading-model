import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { DlqRoutes } from "../../adapters/inbound/routes";
import { ENV } from "../config/env";

export function createServer() {
	return createServiceServer({
		env: ENV,
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes());
		},
	});
}
