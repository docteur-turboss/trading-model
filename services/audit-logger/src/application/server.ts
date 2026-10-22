import type { MongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
import { ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import { eventsRoutes } from "../adapters/inbound/http/events.routes";
import { healthRoutes } from "../adapters/inbound/http/health.routes";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import { ADDRESS_MANAGER_ROUTES } from "../config/address-manager";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";
import type { JobScheduler } from "./scheduler/job-scheduler";

export function createServer(
	scheduler: JobScheduler,
	auditRepo: AuditRepository,
	mongoManager: MongoConnectionManager,
	messageHandler: import("express").RequestHandler
) {
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
