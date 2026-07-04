import rateLimit from "express-rate-limit";

import { ENV } from "../config/env";

export const DEFAULT_LIMITER = rateLimit({
	windowMs: ENV.RATE_LIMIT_WINDOW_MS,
	max: ENV.RATE_LIMIT_MAX,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		error: "Too many requests",
		retryAfter: Math.ceil(ENV.RATE_LIMIT_WINDOW_MS / 1000),
	},
});

export const STRICT_LIMITER = rateLimit({
	windowMs: 60_000,
	max: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		error: "Too many requests",
		retryAfter: 60,
	},
});
