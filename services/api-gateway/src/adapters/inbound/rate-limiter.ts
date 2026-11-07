import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { ENV } from "../../infrastructure/config/env";

/**
 * External traffic reaches the gateway through the edge proxy, so every
 * client shares the proxy's address: limit per API client (identity set by
 * AUTH_MIDDLEWARE, which runs first) and fall back to the address.
 */
function clientKey(req: Request): string {
	const identity = (req as Request & { clientIdentity?: string })
		.clientIdentity;
	return identity ? String(identity) : ipKeyGenerator(req.ip ?? "");
}

export const DEFAULT_LIMITER = rateLimit({
	windowMs: ENV.RATE_LIMIT_WINDOW_MS,
	max: ENV.RATE_LIMIT_MAX,
	keyGenerator: clientKey,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		error: "Too many requests",
		retryAfter: Math.ceil(ENV.RATE_LIMIT_WINDOW_MS / 1000),
	},
});
