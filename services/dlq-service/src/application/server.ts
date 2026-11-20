import type { ReadinessCheck } from "@trading-model/http/readiness";
import { createServiceServer } from "@trading-model/http/service-server-factory";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { DlqHandlers } from "../adapters/inbound/dlq-service";
import { DlqRoutes } from "../adapters/inbound/routes";
import { ENV } from "../infrastructure/config/env";

export function createServer(
	handlers: DlqHandlers,
	mongoReadiness: ReadinessCheck
) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("dlq-service"),
		trustProxy: true,
		routes: (app) => {
			app.use(DlqRoutes(handlers));
		},
		readiness: [mongoReadiness],
	});
}
