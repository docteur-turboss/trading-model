import type { Application } from "express";
import promClient from "prom-client";

import { METRICS_ROUTES } from "../http/routes/metrics.routes";
import { PING_ROUTES } from "../http/routes/ping.routes";
import {
	CACHE_ENTRY_COUNT,
	CIRCUIT_BREAKER_INSTANCES_TOTAL,
} from "../metrics";
import type { CircuitBreaker } from "../discovery/circuit-breaker";
import type { IServiceCache } from "../discovery/service-cache.interface";
import { ServiceCallTracker } from "./service-call-tracker";
import {
	SystemMetrics,
	type SystemMetricsPayload,
} from "./system-metrics";

export class MetricsCollector {
	private readonly _systemMetrics: SystemMetrics;
	private readonly _serviceCallTracker: ServiceCallTracker;

	constructor(
		private readonly _circuitBreaker: CircuitBreaker,
		private readonly _serviceCache: IServiceCache,
		maxCallRecords?: number
	) {
		this._systemMetrics = new SystemMetrics();
		this._serviceCallTracker = new ServiceCallTracker(maxCallRecords ?? 1000);
	}

	listenExpress(app: Application): void {
		app.locals.metricsSnapshot = () => ({
			...this._systemMetrics.collect(),
			callTracker: this._serviceCallTracker.snapshot(),
		});

		app.get("/prometheus", async (_req, res) => {
			res.set("Content-Type", promClient.register.contentType);
			res.end(await promClient.register.metrics());
		});

		app.use(PING_ROUTES);
		app.use(METRICS_ROUTES);
	}

	getMetrics(): SystemMetricsPayload {
		return this._systemMetrics.collect();
	}

	getServiceCallTracker(): ServiceCallTracker {
		return this._serviceCallTracker;
	}

	async collectSaturationMetrics(): Promise<void> {
		const summary = this._circuitBreaker.getStateSummary();
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set({ state: "closed" }, summary.closed);
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set({ state: "open" }, summary.open);
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set(
			{ state: "half-open" },
			summary["half-open"]
		);

		const entries = await this._serviceCache.entries();
		CACHE_ENTRY_COUNT.set(entries.length);
	}
}
