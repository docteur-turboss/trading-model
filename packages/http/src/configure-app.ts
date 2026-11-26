import { getHeapStatistics } from "node:v8";
import express, { type Application } from "express";
import helmet from "helmet";
import promClient from "prom-client";
import { correlationIdMiddleware } from "./correlation-id";
import { httpMetricsMiddleware } from "./http-metrics";
import { createReadinessHandler, type ReadinessCheck } from "./readiness";
import { HEALTH_STATUS_OK } from "./response-exception";
import { PING_PATH } from "./shared/constants";

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

function _addHealthRoutes(
	app: Application,
	readiness?: ReadinessCheck[]
): void {
	app.get(PING_PATH, (_req, res) => {
		res.json({ status: HEALTH_STATUS_OK });
	});
	if (readiness !== undefined) {
		app.get("/health/ready", createReadinessHandler(readiness));
	}
}

/**
 * App of the plain-HTTP probe listener: `/ping` and `/health/ready` only,
 * nothing else is mounted (ADR-0091).
 */
export function createHealthApp(readiness?: ReadinessCheck[]): Application {
	const app = express();
	_addHealthRoutes(app, readiness);
	return app;
}

/** Configures the Express app, body parsers, and ping route. */
export function configureApp(
	config: { trustProxy?: boolean; readiness?: ReadinessCheck[] } = {}
): Application {
	const app = express();

	app.use(helmet());
	_configureTrustProxy(app, config.trustProxy);
	app.use(correlationIdMiddleware);
	app.use(httpMetricsMiddleware);
	app.use(express.json({ limit: "1mb" }));
	app.use(express.urlencoded({ extended: false }));
	_addHealthRoutes(app, config.readiness);

	return app;
}

function _configureTrustProxy(app: Application, trustProxy?: boolean): void {
	if (trustProxy ?? false) {
		app.set("trust proxy", "loopback");
	}
}
