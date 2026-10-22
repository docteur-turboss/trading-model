import { ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { DlqRoutes } from "../adapters/inbound/routes";
import { ENV } from "../infrastructure/config/env";

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("dlq-service"),
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes());
		},
	});
}
