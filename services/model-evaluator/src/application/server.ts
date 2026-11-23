import { createServiceServer } from "@trading-model/http/service-server-factory";
import { redisReadinessCheck } from "@trading-model/persistence/redis-readiness";
import { ServiceId } from "@trading-model/primitives/primitives";
import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("model-evaluator"),
		routes: (app) => {
			app.get("/metrics", metricsHandler);
			ADDRESS_MANAGER_ROUTES(app);
		},
		readiness: [redisReadinessCheck(ENV)],
	});
}
