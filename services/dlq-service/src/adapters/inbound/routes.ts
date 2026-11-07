import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { Router } from "express";
import type rateLimit from "express-rate-limit";
import { metricsHandler } from "../../config/metrics";
import { DLQ_API } from "./api-routes";
import { serviceAuth } from "./auth";
import { HealthCheck, ReadyCheck } from "./controller";
import {
	addEntry,
	deleteEntries,
	listEntries,
	replayEntries,
} from "./dlq-service";
import {
	_createHealthLimiter,
	_createReplayLimiter,
	_createWriteLimiter,
	closeRedisClient,
} from "./rate-limiter";

function _registerDlqRoutes(
	router: Router,
	replayLimiter: ReturnType<typeof rateLimit>,
	writeLimiter: ReturnType<typeof rateLimit>,
	healthLimiter: ReturnType<typeof rateLimit>
): void {
	// The signature covers the raw body: serviceAuth runs before validation.
	mountRoute(router, DLQ_API.addEntry, ({ body }) => addEntry(body), {
		middlewares: [serviceAuth, writeLimiter],
	});
	mountRoute(router, DLQ_API.listEntries, ({ query }) => listEntries(query), {
		middlewares: [serviceAuth],
	});
	mountRoute(router, DLQ_API.deleteEntries, ({ body }) => deleteEntries(body), {
		middlewares: [serviceAuth, writeLimiter],
	});
	mountRoute(
		router,
		DLQ_API.replayEntries,
		({ query }) => replayEntries(query),
		{ middlewares: [serviceAuth, replayLimiter] }
	);
	router.get("/health", healthLimiter, HealthCheck);
	router.get("/health/ready", healthLimiter, ReadyCheck);
	router.get("/metrics", metricsHandler);
}

export const DlqRoutes = (): Router => {
	const router = Router();

	_registerDlqRoutes(
		router,
		_createReplayLimiter(),
		_createWriteLimiter(),
		_createHealthLimiter()
	);

	return router;
};

export { closeRedisClient };
