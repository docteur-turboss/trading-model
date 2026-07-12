import type {
	DurationMs,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import { HEALTH_STATUS_OK } from "@trading-model/common/middleware/response-exception";
import express, { type Application } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { PING_PATH } from "./constants";

/** Configuration for the rate-limiting middleware. */
export interface RateLimitConfig {
	windowMs: DurationMs;
	limit: PositiveInt;
	message?: string;
}

function _buildRateLimiter(config: {
	rateLimit?: RateLimitConfig;
}): ReturnType<typeof rateLimit> {
	return rateLimit({
		windowMs: config.rateLimit?.windowMs ?? 15 * 60 * 1000,
		limit: config.rateLimit?.limit ?? 100,
		message:
			config.rateLimit?.message ??
			"Too many requests from this IP, please try again later.",
	});
}

function _addPingRoute(app: Application): void {
	app.get(PING_PATH, (_req, res) => {
		res.json({ status: HEALTH_STATUS_OK });
	});
}

/** Configures the Express app, body parsers, rate limiter, and ping route. */
export function configureApp(
	config: { rateLimit?: RateLimitConfig; trustProxy?: boolean } = {}
): Application {
	const app = express();

	app.use(helmet());
	_configureTrustProxy(app, config.trustProxy);
	app.use(express.json({ limit: "1mb" }));
	app.use(express.urlencoded({ extended: false }));
	app.use(_buildRateLimiter(config));
	_addPingRoute(app);

	return app;
}

function _configureTrustProxy(app: Application, trustProxy?: boolean): void {
	if (trustProxy ?? false) {
		app.set("trust proxy", "loopback");
	}
}
