import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";

import {
	TRAINER_ROUTES,
	type TrainerRoutesOptions,
} from "../adapters/inbound/http/routes";
import {
	ADDRESS_MANAGER_ROUTES,
	AddressManager,
} from "../config/address-manager";
import { MessageManagerListenExpress } from "../config/message-manager";
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
			MessageManagerListenExpress(app);
		},
		readiness: [
			{
				name: "message-bus",
				check: async () => {
					const target = await AddressManager.findService(
						ServiceInstanceName.MessageDeliveryService
					);
					return Boolean(target);
				},
			},
		],
	});
}
