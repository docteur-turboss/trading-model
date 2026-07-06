import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import RedisStore from "rate-limit-redis";
import { env } from "../config/env";
import { logger } from "../config/logger";

const activeRateLimiters: Array<{ resetKey: (key: string) => void }> = [];

let sharedRedisClient: Redis | null = null;
let sharedRedisInit = false;

function getOrCreateRedis(): Redis | null {
	if (sharedRedisClient) {
		return sharedRedisClient;
	}
	if (sharedRedisInit) {
		return null;
	}
	sharedRedisInit = true;

	if (!env.REDIS_URL) {
		return null;
	}
	return _createRedisClient();
}

function _createRedisClient(): Redis | null {
	try {
		sharedRedisClient = _newRedisClient();
		sharedRedisClient.connect().catch(() => {
			sharedRedisClient = null;
			sharedRedisInit = false;
		});
		return sharedRedisClient;
	} catch {
		return null;
	}
}

function _newRedisClient(): Redis {
	return new Redis(env.REDIS_URL!, {
		lazyConnect: true,
		retryStrategy: (times) => Math.min(times * 200, 5_000),
	});
}

function createStore(): undefined | RedisStore {
	const client = getOrCreateRedis();
	if (!client) {
		_logStoreFallback();
		return;
	}
	return _buildRedisStore(client);
}

function _logStoreFallback(): void {
	logger.warn(
		"Redis unavailable — rate limiting falls back to per-instance memory store"
	);
}

function _buildRedisStore(client: Redis): RedisStore {
	const sendCommand = (...args: string[]): Promise<number> => {
		return client.call(
			args[0],
			...args.slice(1)
		) as Promise<unknown> as Promise<number>;
	};
	return new RedisStore({ sendCommand });
}

export async function closeRedisClient(): Promise<void> {
	if (sharedRedisClient) {
		try {
			await sharedRedisClient.quit();
		} catch {
			sharedRedisClient.disconnect();
		}
		sharedRedisClient = null;
	}
	sharedRedisInit = false;
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
		store: createStore(),
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
