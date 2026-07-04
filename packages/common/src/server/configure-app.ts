import express, { type Application } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";

import { PING_PATH } from "./constants";

/** Configuration for the rate-limiting middleware. */
export interface RateLimitConfig {
	windowMs: number;
	limit: number;
	message?: string;
}

/** Configures the Express app, body parsers, rate limiter, and ping route. */
export function configureApp(
	config: { rateLimit?: RateLimitConfig; trustProxy?: boolean } = {}
): Application {
	const app = express();

	app.use(helmet());

	if (config.trustProxy ?? false) {
		app.set("trust proxy", "loopback");
	}

	app.use(express.json({ limit: "1mb" }));
	app.use(express.urlencoded({ extended: false }));

	const limiter = rateLimit({
		windowMs: config.rateLimit?.windowMs ?? 15 * 60 * 1000,
		limit: config.rateLimit?.limit ?? 100,
		message:
			config.rateLimit?.message ??
			"Too many requests from this IP, please try again later.",
	});

	app.use(limiter);

	app.get(PING_PATH, (_req, res) => {
		res.json({ status: "ok" });
	});

	return app;
}
