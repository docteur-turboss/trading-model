import { svidReadinessCheck } from "@trading-model/http/readiness";
import { createServiceServer } from "@trading-model/http/service-server-factory";
import { redisReadinessCheck } from "@trading-model/persistence/redis-readiness";
import { ServiceId } from "@trading-model/primitives/primitives";

import {
	TRAINER_ROUTES,
	type TrainerRoutesOptions,
} from "../adapters/inbound/http/routes";
import {
	ADDRESS_MANAGER_ROUTES,
	REGISTRATION_READINESS,
} from "../config/address-manager";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";
import type { Trainer } from "./trainer";

/** Create and return a secure Express server with trader-trainer routes. */
export function createServer(trainer: Trainer, models: TrainerRoutesOptions) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("trader-trainer"),
		routes: (app) => {
			app.use(TRAINER_ROUTES(trainer, models));
			app.get("/metrics", metricsHandler);

			ADDRESS_MANAGER_ROUTES(app);
		},
		// No discovery lookup: resolution falls back to the last known address during a discovery outage.
		readiness: [
			svidReadinessCheck(ENV),
			REGISTRATION_READINESS,
			redisReadinessCheck(ENV),
		],
	});
}
