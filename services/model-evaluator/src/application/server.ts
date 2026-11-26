import { createServiceServer } from "@trading-model/http/service-server-factory";
import { redisReadinessCheck } from "@trading-model/persistence/redis-readiness";
import { ServiceId } from "@trading-model/primitives/primitives";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("model-evaluator"),
		routes: (app) => {
			app.get("/metrics", metricsHandler);
		},
		readiness: [redisReadinessCheck(ENV)],
	});
}
