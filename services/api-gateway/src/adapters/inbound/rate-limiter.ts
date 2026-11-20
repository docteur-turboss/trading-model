import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import type { Env } from "../../infrastructure/config/env";

/**
 * External traffic reaches the gateway through the edge proxy, so every
 * client shares the proxy's address: limit per API client (identity set by
 * AUTH_MIDDLEWARE, which runs first) and fall back to the address.
 */
function clientKey(req: Request): string {
	const identity = (req as Request & { clientIdentity?: string })
		.clientIdentity;
	return identity || ipKeyGenerator(req.ip ?? "");
}

// In-memory store: counts per pod, so the effective limit is max x replicas (ADR-0047).
export const createRateLimiter = (
	env: Pick<Env, "RATE_LIMIT_WINDOW_MS" | "RATE_LIMIT_MAX">
) =>
	rateLimit({
		windowMs: env.RATE_LIMIT_WINDOW_MS,
		max: env.RATE_LIMIT_MAX,
		keyGenerator: clientKey,
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Too many requests",
			retryAfter: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
		},
	});
