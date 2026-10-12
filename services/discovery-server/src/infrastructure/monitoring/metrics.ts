import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

const HTTP_REQUESTS_TOTAL = new promClient.Counter({
	name: "discovery_http_requests_total",
	help: "Total HTTP requests by method, path, and status",
	labelNames: ["method", "path", "status"],
});

const HTTP_REQUEST_DURATION_SECONDS = new promClient.Histogram({
	name: "discovery_http_request_duration_seconds",
	help: "HTTP request latency in seconds",
	labelNames: ["method", "path"],
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

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

import type { HttpStatusCode } from "@trading-model/common/http-status";
import type { HttpMethod } from "@trading-model/validation/domain/contracts/signed-request.types";

export interface RequestTrack {
	method: HttpMethod;
	path: string;
	status: HttpStatusCode;
	durationMs: number;
}

export function trackRequest({
	method,
	path,
	status,
	durationMs,
}: RequestTrack): void {
	HTTP_REQUESTS_TOTAL.inc({ method, path, status });
	HTTP_REQUEST_DURATION_SECONDS.observe({ method, path }, durationMs / 1000);
}

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

export { metricsHandler };
