import { createSecureServer } from "@trading-model/common/server/create-secure-server";

import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { ENV } from "../config/env";
import type { AuditRepository } from "../persistence/audit-repository";
import { eventsRoutes } from "../routes/events.routes";
import { healthRoutes } from "../routes/health.routes";
import type { JobScheduler } from "../scheduler/job-scheduler";
import { createMessageHandler } from "../subscription/audit-subscriber";

export function createServer(
	scheduler: JobScheduler,
	auditRepo: AuditRepository
) {
	const messageHandler = createMessageHandler(auditRepo);

	return createSecureServer({
		port: ENV.PORT,
		tls: {
			keyPath: ENV.TLS_KEY_PATH,
			certPath: ENV.TLS_CERT_PATH,
			caPath: ENV.TLS_CA_PATH,
		},
		routes: (app) => {
			app.use(
				"/",
				healthRoutes(scheduler.queue, scheduler.backPressure, scheduler.workers)
			);
			app.use("/", eventsRoutes(auditRepo));
			app.post("/message", messageHandler);
			ADDRESS_MANAGER_ROUTES(app);
		},
	});
}
