import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import type { MongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
import { ServiceId } from "@trading-model/primitives/primitives";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { Application } from "express";
import { Router } from "express";
import { AUDIT_API } from "../adapters/inbound/http/api-routes";
import { eventsRoutes } from "../adapters/inbound/http/events.routes";
import { healthRoutes } from "../adapters/inbound/http/health.routes";
import type { createMessageHandler } from "../adapters/inbound/subscription/audit-subscriber";
import type { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import {
	ADDRESS_MANAGER_ROUTES,
	REGISTRATION_READINESS,
} from "../config/address-manager";
import { metricsHandler } from "../config/metrics";
import { ENV } from "../infrastructure/config/env";

type MessageHandler = ReturnType<typeof createMessageHandler>;

export function createServer(
	auditRepo: AuditRepository,
	mongoManager: MongoConnectionManager,
	messageHandler: MessageHandler
) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("audit-logger"),
		routes: (app) => {
			_registerRoutes(app, auditRepo, messageHandler);
		},
		readiness: [
			REGISTRATION_READINESS,
			{
				name: "mongo",
				check: async () => {
					if (!mongoManager.isConnected()) {
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

function _registerRoutes(
	app: Application,
	auditRepo: AuditRepository,
	messageHandler: MessageHandler
): void {
	app.use("/", healthRoutes());
	app.use("/", eventsRoutes(auditRepo));
	const broker = Router();
	mountRoute(broker, AUDIT_API.receive, messageHandler);
	app.use(broker);
	app.get("/metrics", metricsHandler);
	ADDRESS_MANAGER_ROUTES(app);
}
