import { Router } from "express";
import type rateLimit from "express-rate-limit";
import { metricsHandler } from "../../config/metrics";
import { serviceAuth } from "./auth";
import {
	AddEntry,
	DeleteEntries,
	HealthCheck,
	ListEntries,
	ReadyCheck,
	ReplayEntries,
} from "./controller";
import {
	_createHealthLimiter,
	_createReplayLimiter,
	_createWriteLimiter,
	closeRateLimiters,
	closeRedisClient,
} from "./rate-limiter";

function _registerDlqRoutes(
	router: Router,
	replayLimiter: ReturnType<typeof rateLimit>,
	writeLimiter: ReturnType<typeof rateLimit>,
	healthLimiter: ReturnType<typeof rateLimit>
): void {
	router.post("/dlq", serviceAuth, writeLimiter, AddEntry);
	router.get("/dlq", serviceAuth, ListEntries);
	router.delete("/dlq", serviceAuth, writeLimiter, DeleteEntries);
	router.post("/dlq/replay", serviceAuth, replayLimiter, ReplayEntries);
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

export { closeRateLimiters, closeRedisClient };
