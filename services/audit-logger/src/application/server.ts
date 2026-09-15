import { ServiceId } from "@trading-model/common/domain/primitives";
import type { MongoConnectionManager } from "@trading-model/common/persistence/mongo-connection-manager";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { createMessageHandler } from "../adapters/inbound/subscription/audit-subscriber";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";
import { eventsRoutes } from "../routes/events.routes";
import { healthRoutes } from "../routes/health.routes";
import type { JobScheduler } from "../scheduler/job-scheduler";

export function createServer(
	scheduler: JobScheduler,
	auditRepo: AuditRepository,
	mongoManager: MongoConnectionManager
) {
	const messageHandler = createMessageHandler(auditRepo);

	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("audit-logger"),
		routes: (app) => {
			_registerRoutes(app, scheduler, auditRepo, messageHandler);
		},
		readiness: [
			{
				name: "mongo",
				check: async () => {
					if (!mongoManager.isConnected()) {
						return false;
					}
					try {
						const db = await mongoManager.getDb();
						await db.command({ ping: 1 });
						return true;
					} catch {
						return false;
					}
				},
			},
		],
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
	app.get("/metrics", metricsHandler);
	ADDRESS_MANAGER_ROUTES(app);
}
