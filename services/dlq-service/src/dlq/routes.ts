import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deterministicStringify } from "@trading-model/common/utils/deterministic-stringify";
import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import RedisStore from "rate-limit-redis";
import { env, resolveAuthHmacSecret } from "../config/env";
import { logger } from "../config/logger";
import { metricsHandler } from "../config/metrics";
import {
	AddEntry,
	DeleteEntries,
	HealthCheck,
	ListEntries,
	ReadyCheck,
	ReplayEntries,
} from "./controller";

const ALLOWED_SERVICES = env.DLQ_ALLOWED_SERVICES.split(",")
	.map((service) => service.trim())
	.filter(Boolean);

const activeRateLimiters: Array<{ resetKey: (key: string) => void }> = [];

function normalizeBody(body: unknown): unknown {
	return body ?? {};
}

function verifySignature(req: Request, serviceName: string): boolean {
	const secret = resolveAuthHmacSecret();

	const provided = (req.headers["x-signature"] as string) || "";
	const timestampStr = (req.headers["x-timestamp"] as string) || "";

	const timestamp = _validateTimestamp(timestampStr, provided);
	if (timestamp === null) {
		return false;
	}

	let bodyString: string;
	try {
		bodyString = deterministicStringify(normalizeBody(req.body));
	} catch {
		logger.warn("Failed to stringify request body for signature verification", {
			serviceName,
		});
		return false;
	}

	const bodyHash = createHash("sha256").update(bodyString).digest("hex");

	const parts = [serviceName, timestampStr, bodyHash, req.method, req.path];
	if (_matchSignature(provided, secret, parts)) {
		return true;
	}

	const oldParts = [serviceName, timestampStr, bodyString, req.method, req.path];

	return _matchSignature(provided, secret, oldParts);
}

function _validateTimestamp(
	timestampStr: string,
	provided: string
): number | null {
	if (!(timestampStr && provided)) {
		return null;
	}
	const timestamp = Number.parseInt(timestampStr, 10);
	if (Number.isNaN(timestamp)) {
		return null;
	}
	if (Math.abs(Date.now() - timestamp) > 300_000) {
		return null;
	}
	return timestamp;
}

function _matchSignature(
	provided: string,
	secret: string,
	parts: string[]
): boolean {
	const expected = createHmac("sha256", secret)
		.update(parts.join(":"))
		.digest("hex");
	return (
		provided.length === expected.length &&
		timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
	);
}

function serviceAuth(req: Request, res: Response, next: NextFunction): void {
	const serviceName = req.headers["x-service-name"] as string | undefined;
	if (!(serviceName && ALLOWED_SERVICES.includes(serviceName))) {
		res.status(403).json({ error: "Unauthorized service" });
		return;
	}
	if (!verifySignature(req, serviceName)) {
		res.status(401).json({ error: "Invalid or expired signature" });
		return;
	}
	next();
}

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
	try {
		sharedRedisClient = new Redis(env.REDIS_URL, {
			lazyConnect: true,
			retryStrategy: (times) => {
				const delay = Math.min(times * 200, 5_000);
				return delay;
			},
		});
		sharedRedisClient.connect().catch(() => {
			sharedRedisClient = null;
			sharedRedisInit = false;
		});
		return sharedRedisClient;
	} catch {
		return null;
	}
}

function createStore(): undefined | RedisStore {
	const client = getOrCreateRedis();
	if (!client) {
		logger.warn(
			"Redis unavailable — rate limiting falls back to per-instance memory store"
		);
		return;
	}
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

export const DlqRoutes = (): Router => {
	const router = Router();

	const replayLimiter = rateLimit({
		windowMs: 60_000,
		max: 10,
		standardHeaders: true,
		legacyHeaders: false,
		store: createStore(),
		message: { error: "Too many replay requests, try again later" },
	});

	const writeLimiter = rateLimit({
		windowMs: 1000,
		max: 100,
		standardHeaders: true,
		legacyHeaders: false,
		store: createStore(),
		message: { error: "Too many DLQ write requests, try again later" },
	});

	const healthLimiter = rateLimit({
		windowMs: 60_000,
		max: 60,
		standardHeaders: true,
		legacyHeaders: false,
		store: createStore(),
		message: { error: "Too many health check requests" },
	});

	if (typeof replayLimiter === "function" && "resetKey" in replayLimiter) {
		activeRateLimiters.push(
			replayLimiter as unknown as { resetKey: (key: string) => void }
		);
	}
	if (typeof writeLimiter === "function" && "resetKey" in writeLimiter) {
		activeRateLimiters.push(
			writeLimiter as unknown as { resetKey: (key: string) => void }
		);
	}
	if (typeof healthLimiter === "function" && "resetKey" in healthLimiter) {
		activeRateLimiters.push(
			healthLimiter as unknown as { resetKey: (key: string) => void }
		);
	}

	router.post("/dlq", serviceAuth, writeLimiter, AddEntry);
	router.get("/dlq", serviceAuth, ListEntries);
	router.delete("/dlq", serviceAuth, writeLimiter, DeleteEntries);
	router.post("/dlq/replay", serviceAuth, replayLimiter, ReplayEntries);
	router.get("/health", healthLimiter, HealthCheck);
	router.get("/health/ready", healthLimiter, ReadyCheck);
	router.get("/metrics", metricsHandler);

	return router;
};
