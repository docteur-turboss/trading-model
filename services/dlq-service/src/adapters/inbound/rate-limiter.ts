import rateLimit from "express-rate-limit";
import { redisClientManager } from "../../infrastructure/rate-limiter-redis-client";
import { createRedisStore } from "../../infrastructure/rate-limiter-store";

export async function closeRedisClient(): Promise<void> {
	await redisClientManager.close();
}

function createDlqRateLimiter({
	name,
	...opts
}: {
	name: string;
	windowMs: number;
	max: number;
	message: { error: string };
}): ReturnType<typeof rateLimit> {
	return rateLimit({
		...opts,
		standardHeaders: true,
		legacyHeaders: false,
		store: createRedisStore(`rl:dlq:${name}:`),
	});
}

function _createReplayLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		name: "replay",
		windowMs: 60_000,
		max: 10,
		message: { error: "Too many replay requests, try again later" },
	});
}

function _createWriteLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		name: "write",
		windowMs: 1000,
		max: 100,
		message: { error: "Too many DLQ write requests, try again later" },
	});
}

function _createHealthLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		name: "health",
		windowMs: 60_000,
		max: 60,
		message: { error: "Too many health check requests" },
	});
}

export { _createHealthLimiter, _createReplayLimiter, _createWriteLimiter };
