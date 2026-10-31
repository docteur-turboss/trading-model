import { getHeapStatistics } from "node:v8";
import { correlationIdMiddleware } from "@trading-model/http/adapters/inbound/correlation-id";
import { HEALTH_STATUS_OK } from "@trading-model/http/adapters/inbound/response-exception";
import type {
	DurationMs,
	PositiveInt,
} from "@trading-model/primitives/primitives";
import express, { type Application } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import promClient from "prom-client";
import { PING_PATH } from "../../shared/constants";
import { httpMetricsMiddleware } from "./http-metrics";
import { createReadinessHandler, type ReadinessCheck } from "./readiness";

promClient.collectDefaultMetrics();

// The heap ceiling V8 enforces (from --max-old-space-size or the container
// memory): used/limit is the OOM distance. used/total is not, V8 keeps the
// allocated heap close to the used one.
new promClient.Gauge({
	name: "nodejs_heap_size_limit_bytes",
	help: "V8 heap size limit in bytes",
	collect() {
		this.set(getHeapStatistics().heap_size_limit);
	},
});

/** Configuration for the rate-limiting middleware. */
export interface RateLimitConfig {
	windowMs: DurationMs;
	limit: PositiveInt;
	message?: string;
}

function _buildRateLimiter(config: {
	rateLimit?: RateLimitConfig;
}): ReturnType<typeof rateLimit> {
	// Coarse per-IP guard for an mTLS-only mesh: it must fit normal service
	// traffic (heartbeats, token refresh, lookups, publishes). The former
	// 100 per 15 min was exhausted by one service's heartbeats alone.
	return rateLimit({
		windowMs: config.rateLimit?.windowMs ?? 60 * 1000,
		limit: config.rateLimit?.limit ?? 1000,
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
	config: {
		rateLimit?: RateLimitConfig;
		trustProxy?: boolean;
		readiness?: ReadinessCheck[];
	} = {}
): Application {
	const app = express();

	app.use(helmet());
	_configureTrustProxy(app, config.trustProxy);
	app.use(correlationIdMiddleware);
	app.use(httpMetricsMiddleware);
	app.use(express.json({ limit: "1mb" }));
	app.use(express.urlencoded({ extended: false }));
	app.use(_buildRateLimiter(config));
	_addPingRoute(app);
	if (config.readiness !== undefined) {
		app.get("/health/ready", createReadinessHandler(config.readiness));
	}

	return app;
}

function _configureTrustProxy(app: Application, trustProxy?: boolean): void {
	if (trustProxy ?? false) {
		app.set("trust proxy", "loopback");
	}
}
