import rateLimit from "express-rate-limit";
import { redisClientManager } from "../../infrastructure/rate-limiter-redis-client";
import { createRedisStore } from "../../infrastructure/rate-limiter-store";

const activeRateLimiters: Array<{ resetKey: (key: string) => void }> = [];

export async function closeRedisClient(): Promise<void> {
	await redisClientManager.close();
}

export function closeRateLimiters(): void {
	activeRateLimiters.length = 0;
}

function createDlqRateLimiter(opts: {
	windowMs: number;
	max: number;
	message: { error: string };
}): ReturnType<typeof rateLimit> {
	const limiter = rateLimit({
		...opts,
		standardHeaders: true,
		legacyHeaders: false,
		store: createRedisStore(),
	});
	_trackLimiter(limiter);
	return limiter;
}

function _trackLimiter(limiter: ReturnType<typeof rateLimit>): void {
	if (typeof limiter === "function" && "resetKey" in limiter) {
		activeRateLimiters.push(
			limiter as unknown as { resetKey: (key: string) => void }
		);
	}
}

function _createReplayLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		windowMs: 60_000,
		max: 10,
		message: { error: "Too many replay requests, try again later" },
	});
}

function _createWriteLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		windowMs: 1000,
		max: 100,
		message: { error: "Too many DLQ write requests, try again later" },
	});
}

function _createHealthLimiter(): ReturnType<typeof rateLimit> {
	return createDlqRateLimiter({
		windowMs: 60_000,
		max: 60,
		message: { error: "Too many health check requests" },
	});
}

export { _createHealthLimiter, _createReplayLimiter, _createWriteLimiter };
