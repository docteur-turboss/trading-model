import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import type { Env } from "../../infrastructure/config/env";
import { clientIdentityOf, presentedToken } from "./auth";

// In-memory store: counts per pod, so the effective limit is max x replicas (ADR-0047).
export const createRateLimiter = (
	env: Pick<
		Env,
		"RATE_LIMIT_WINDOW_MS" | "RATE_LIMIT_MAX" | "AUTH_TOKEN_HEADER"
	>
) =>
	rateLimit({
		windowMs: env.RATE_LIMIT_WINDOW_MS,
		max: env.RATE_LIMIT_MAX,
		/**
		 * Runs before auth, so token guesses are limited too. Every client shares
		 * the edge proxy's address: key on the presented token, else the address.
		 */
		keyGenerator: (req: Request) => {
			const token = presentedToken(req, env);
			return token ? clientIdentityOf(token) : ipKeyGenerator(req.ip ?? "");
		},
		standardHeaders: true,
		legacyHeaders: false,
		message: {
			error: "Too many requests",
			retryAfter: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
		},
	});
