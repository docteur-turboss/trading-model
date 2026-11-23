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

const limiterOptions = (
	env: Pick<Env, "RATE_LIMIT_WINDOW_MS" | "RATE_LIMIT_MAX">
) => ({
	windowMs: env.RATE_LIMIT_WINDOW_MS,
	max: env.RATE_LIMIT_MAX,
	standardHeaders: true as const,
	legacyHeaders: false as const,
	message: {
		error: "Too many requests",
		retryAfter: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
	},
});

/**
 * Address of the real client: the edge proxy overwrites X-Forwarded-For with it
 * (anonymized to its /24) and is the only caller the gateway ACL allows.
 */
function addressKey(req: Request): string {
	const forwarded = req.headers["x-forwarded-for"];
	const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
		?.split(",")[0]
		?.trim();
	return ipKeyGenerator(first || req.ip || "");
}

/** Counts only 401 answers per client address and answers 429 once over the limit, before the key is checked. */
export const createAuthFailureLimiter = (
	env: Pick<Env, "RATE_LIMIT_WINDOW_MS" | "RATE_LIMIT_MAX">
) =>
	rateLimit({
		...limiterOptions(env),
		keyGenerator: addressKey,
		skipSuccessfulRequests: true,
		requestWasSuccessful: (_req, res) => res.statusCode !== 401,
	});

// In-memory store: counts per pod, so the effective limit is max x replicas (ADR-0047).
export const createRateLimiter = (
	env: Pick<Env, "RATE_LIMIT_WINDOW_MS" | "RATE_LIMIT_MAX">
) => rateLimit({ ...limiterOptions(env), keyGenerator: clientKey });
