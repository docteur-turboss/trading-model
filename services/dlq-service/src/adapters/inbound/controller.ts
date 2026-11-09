import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import type { HealthHandlers } from "./dlq-health-handler";

// The API routes are mounted from their registry entries (api-routes.ts).

export function createHealthControllers(handlers: HealthHandlers) {
	return {
		HealthCheck: catchSync((_req) => handlers.healthCheck()),
		ReadyCheck: catchSync((_req) => handlers.readyCheck()),
	};
}
