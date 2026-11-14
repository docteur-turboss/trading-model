import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { Router } from "express";
import { EVALUATOR_API } from "../adapters/inbound/api-routes";
import type { createMessageHandler } from "../adapters/inbound/evaluation-subscriber";
import {
	ADDRESS_MANAGER_ROUTES,
	REGISTRATION_READINESS,
} from "../config/address-manager";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";

export function createServer(
	messageHandler: ReturnType<typeof createMessageHandler>
) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("model-evaluator"),
		routes: (app) => {
			const broker = Router();
			mountRoute(broker, EVALUATOR_API.receive, messageHandler);
			app.use(broker);
			app.get("/metrics", metricsHandler);
			ADDRESS_MANAGER_ROUTES(app);
		},
		readiness: [REGISTRATION_READINESS],
	});
}
