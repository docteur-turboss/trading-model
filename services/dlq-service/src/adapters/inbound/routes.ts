import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { Router } from "express";
import type rateLimit from "express-rate-limit";
import { metricsHandler } from "../../config/metrics";
import { DLQ_API } from "./api-routes";
import { serviceAuth } from "./auth";
import { createHealthControllers } from "./controller";
import type { DlqHandlers } from "./dlq-service";
import {
	_createHealthLimiter,
	_createReplayLimiter,
	_createWriteLimiter,
	closeRateLimiters,
} from "./rate-limiter";

function _registerDlqRoutes(
	router: Router,
	handlers: DlqHandlers,
	replayLimiter: ReturnType<typeof rateLimit>,
	writeLimiter: ReturnType<typeof rateLimit>,
	healthLimiter: ReturnType<typeof rateLimit>
): void {
	// The signature covers the raw body: serviceAuth runs before validation.
	mountRoute(router, DLQ_API.addEntry, ({ body }) => handlers.addEntry(body), {
		middlewares: [serviceAuth, writeLimiter],
	});
	mountRoute(
		router,
		DLQ_API.listEntries,
		({ query }) => handlers.listEntries(query),
		{
			middlewares: [serviceAuth],
		}
	);
	mountRoute(
		router,
		DLQ_API.deleteEntries,
		({ body }) => handlers.deleteEntries(body),
		{
			middlewares: [serviceAuth, writeLimiter],
		}
	);
	mountRoute(
		router,
		DLQ_API.replayEntries,
		({ query }) => handlers.replayEntries(query),
		{ middlewares: [serviceAuth, replayLimiter] }
	);
	const { HealthCheck, ReadyCheck } = createHealthControllers(handlers);
	router.get("/health", healthLimiter, HealthCheck);
	router.get("/health/ready", healthLimiter, ReadyCheck);
	router.get("/metrics", metricsHandler);
}

export const DlqRoutes = (handlers: DlqHandlers): Router => {
	const router = Router();

	_registerDlqRoutes(
		router,
		handlers,
		_createReplayLimiter(),
		_createWriteLimiter(),
		_createHealthLimiter()
	);

	return router;
};

export { closeRateLimiters };
