import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import { healthCheck, readyCheck } from "./dlq-service";

// The API routes are mounted from their registry entries (api-routes.ts).

export const HealthCheck = catchSync((_req) => healthCheck());

export const ReadyCheck = catchSync((_req) => readyCheck());
