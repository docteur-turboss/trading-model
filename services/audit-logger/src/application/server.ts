import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { createMessageHandler } from "../adapters/inbound/subscription/audit-subscriber";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { ENV } from "../infrastructure/config/env";
import { eventsRoutes } from "../routes/events.routes";
import { healthRoutes } from "../routes/health.routes";
import type { JobScheduler } from "../scheduler/job-scheduler";

export function createServer(
	scheduler: JobScheduler,
	auditRepo: AuditRepository
) {
	const messageHandler = createMessageHandler(auditRepo);

	return createServiceServer({
		env: ENV,
		routes: (app) => {
			_registerRoutes(app, scheduler, auditRepo, messageHandler);
		},
	});
}

function _registerRoutes(
	app: import("express").Application,
	scheduler: JobScheduler,
	auditRepo: AuditRepository,
	messageHandler: import("express").RequestHandler
): void {
	app.use(
		"/",
		healthRoutes(scheduler.queue, scheduler.backPressure, scheduler.workers)
	);
	app.use("/", eventsRoutes(auditRepo));
	app.post("/message", messageHandler);
	ADDRESS_MANAGER_ROUTES(app);
}
