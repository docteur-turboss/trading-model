import { ServiceId } from "@trading-model/primitives/primitives";
import { svidReadinessCheck } from "@trading-model/server-utils/readiness";
import { createServiceServer } from "@trading-model/server-utils/service-server-factory";
import type { DlqHandlers } from "../adapters/inbound/dlq-service";
import { DlqRoutes } from "../adapters/inbound/routes";
import { ENV } from "../infrastructure/config/env";

export function createServer(handlers: DlqHandlers) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("dlq-service"),
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes(handlers));
		},
		readiness: [svidReadinessCheck(ENV)],
	});
}
