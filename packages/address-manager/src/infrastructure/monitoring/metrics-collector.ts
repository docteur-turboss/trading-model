import { CircuitState } from "@trading-model/primitives/circuit-state";
import type { Application } from "express";
import promClient from "prom-client";
import { STATUS_ROUTES } from "../../adapters/inbound/routes/metrics.routes";
import { PING_ROUTES } from "../../adapters/inbound/routes/ping.routes";
import type { DiscoveryCircuitBreaker } from "../../application/discovery/circuit-breaker";
import type { ServiceCachePort } from "../../domain/ports/service-cache.port";
import { CACHE_ENTRY_COUNT, CIRCUIT_BREAKER_INSTANCES_TOTAL } from "../metrics";
import { SystemMetrics, type SystemMetricsPayload } from "./system-metrics";

/** Collects the service metrics and exposes them over Express. */
export class MetricsCollector {
	private readonly _systemMetrics: SystemMetrics;

	constructor(
		private readonly _circuitBreaker: DiscoveryCircuitBreaker,
		private readonly _serviceCache: ServiceCachePort
	) {
		this._systemMetrics = new SystemMetrics();
	}

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

	async collectSaturationMetrics(): Promise<void> {
		const summary = this._circuitBreaker.getStateSummary();
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set(
			{ state: CircuitState.CLOSED },
			summary[CircuitState.CLOSED]
		);
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set(
			{ state: CircuitState.OPEN },
			summary[CircuitState.OPEN]
		);
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set(
			{ state: CircuitState.HALF_OPEN },
			summary[CircuitState.HALF_OPEN]
		);

		const entries = await this._serviceCache.entries();
		CACHE_ENTRY_COUNT.set(entries.length);
	}
}
