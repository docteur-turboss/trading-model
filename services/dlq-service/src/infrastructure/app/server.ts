import { ServiceId } from "@trading-model/common/domain/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { DlqRoutes } from "../../adapters/inbound/routes";
import { ENV } from "../config/env";

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
