import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

const REGISTERED_INSTANCES = new promClient.Gauge({
	name: "discovery_registered_instances",
	help: "Number of registered service instances",
});

const REGISTERED_INSTANCES_PER_SERVICE = new promClient.Gauge({
	name: "discovery_registered_instances_per_service",
	help: "Number of registered service instances per service",
	labelNames: ["service"] as const,
});

const HEARTBEATS_TOTAL = new promClient.Counter({
	name: "discovery_heartbeats_total",
	help: "Total heartbeats received per service",
	labelNames: ["service"] as const,
});

const CLEANUP_DURATION_SECONDS = new promClient.Histogram({
	name: "discovery_cleanup_duration_seconds",
	help: "Duration of lease cleanup cycles",
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

const OPERATION_ERRORS_TOTAL = new promClient.Counter({
	name: "discovery_operation_errors_total",
	help: "Total operation errors by type",
	labelNames: ["operation"] as const,
});

const LEASE_CLEANUP_CYCLES_TOTAL = new promClient.Counter({
	name: "discovery_lease_cleanup_cycles_total",
	help: "Total lease cleanup cycles executed",
});

import type { DiscoveryMetricsPort } from "../../domain/ports/discovery-metrics.port";

export function setRegisteredInstances(count: number): void {
	REGISTERED_INSTANCES.set(count);
}

export function setRegisteredInstancesPerService(
	service: string,
	count: number
): void {
	REGISTERED_INSTANCES_PER_SERVICE.set({ service }, count);
}

export function incHeartbeatsTotal(service: string): void {
	HEARTBEATS_TOTAL.inc({ service });
}

export function observeCleanupDuration(durationMs: number): void {
	CLEANUP_DURATION_SECONDS.observe(durationMs / 1000);
}

export function incOperationError(operation: string): void {
	OPERATION_ERRORS_TOTAL.inc({ operation });
}

export function incLeaseCleanupCycle(): void {
	LEASE_CLEANUP_CYCLES_TOTAL.inc();
}

/** DiscoveryMetricsPort backed by the Prometheus collectors above. */
export const prometheusDiscoveryMetrics: DiscoveryMetricsPort = {
	setRegisteredInstances,
	setRegisteredInstancesPerService,
	incLeaseCleanupCycle,
	observeCleanupDuration,
	incOperationError,
};

export { metricsHandler };
