import type { Application } from "express";
import promClient from "prom-client";
import { STATUS_ROUTES } from "../routes/metrics.routes";
import { PING_ROUTES } from "../routes/ping.routes";
import { SystemMetrics, type SystemMetricsPayload } from "./system-metrics";

/** Collects the service metrics and exposes them over Express. */
export class MetricsCollector {
	private readonly _systemMetrics = new SystemMetrics();

	listenExpress(app: Application): void {
		this._setupMetricsSnapshot(app);
		this._setupPrometheusEndpoint(app);
		app.use(PING_ROUTES);
		app.use(STATUS_ROUTES);
	}

	private _setupPrometheusEndpoint(app: Application): void {
		app.get("/metrics", async (_req, res) => {
			res.set("Content-Type", promClient.register.contentType);
			res.end(await promClient.register.metrics());
		});
	}

	private _setupMetricsSnapshot(app: Application): void {
		app.locals.metricsSnapshot = () => this._systemMetrics.collect();
	}

	getMetrics(): SystemMetricsPayload {
		return this._systemMetrics.collect();
	}
}
