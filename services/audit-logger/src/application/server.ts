import { createServiceServer } from "@trading-model/http/service-server-factory";
import type { MongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import { eventsRoutes } from "../adapters/inbound/http/events.routes";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import {
	ADDRESS_MANAGER_ROUTES,
	REGISTRATION_READINESS,
} from "../config/address-manager";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";

export function createServer(
	auditRepo: AuditRepository,
	mongoManager: MongoConnectionManager,
	isReady: () => boolean
) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("audit-logger"),
		routes: (app) => {
			_registerRoutes(app, auditRepo);
		},
		readiness: [
			REGISTRATION_READINESS,
			{
				name: "mongo",
				check: async () => {
					if (!(isReady() && mongoManager.isConnected())) {
						return false;
					}
					const db = await mongoManager.getDb();
					await db.command({ ping: 1 });
					return true;
				},
			},
		],
	});
}

function _registerRoutes(app: Application, auditRepo: AuditRepository): void {
	app.use("/", eventsRoutes(auditRepo));
	app.get("/metrics", metricsHandler);
	ADDRESS_MANAGER_ROUTES(app);
}
