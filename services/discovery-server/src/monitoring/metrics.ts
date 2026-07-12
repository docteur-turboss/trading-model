import type { RequestHandler } from "express";
import client from "prom-client";

const METRICS_REGISTRY = new client.Registry();

client.collectDefaultMetrics({ register: METRICS_REGISTRY });

const HTTP_REQUESTS_TOTAL = new client.Counter({
	name: "discovery_http_requests_total",
	help: "Total HTTP requests by method, path, and status",
	labelNames: ["method", "path", "status"],
	registers: [METRICS_REGISTRY],
});

const HTTP_REQUEST_DURATION_SECONDS = new client.Histogram({
	name: "discovery_http_request_duration_seconds",
	help: "HTTP request latency in seconds",
	labelNames: ["method", "path"],
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
	registers: [METRICS_REGISTRY],
});

const ACTIVE_CONNECTIONS = new client.Gauge({
	name: "discovery_ws_active_connections",
	help: "Number of currently connected WebSocket clients",
	registers: [METRICS_REGISTRY],
});

const REGISTERED_INSTANCES = new client.Gauge({
	name: "discovery_registered_instances",
	help: "Number of registered service instances",
	registers: [METRICS_REGISTRY],
});

const REGISTERED_INSTANCES_PER_SERVICE = new client.Gauge({
	name: "discovery_registered_instances_per_service",
	help: "Number of registered service instances per service",
	labelNames: ["service"] as const,
	registers: [METRICS_REGISTRY],
});

const HEARTBEATS_TOTAL = new client.Counter({
	name: "discovery_heartbeats_total",
	help: "Total heartbeats received per service",
	labelNames: ["service"] as const,
	registers: [METRICS_REGISTRY],
});

const CACHE_INVALIDATIONS_TOTAL = new client.Counter({
	name: "discovery_cache_invalidations_total",
	help: "Total cache invalidation events broadcast",
	registers: [METRICS_REGISTRY],
});

const CLEANUP_DURATION_SECONDS = new client.Histogram({
	name: "discovery_cleanup_duration_seconds",
	help: "Duration of lease cleanup cycles",
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
	registers: [METRICS_REGISTRY],
});

const WS_DROPPED_MESSAGES_TOTAL = new client.Counter({
	name: "discovery_ws_dropped_messages_total",
	help: "Total WebSocket messages dropped due to queue overflow",
	registers: [METRICS_REGISTRY],
});

const OPERATION_ERRORS_TOTAL = new client.Counter({
	name: "discovery_operation_errors_total",
	help: "Total operation errors by type",
	labelNames: ["operation"] as const,
	registers: [METRICS_REGISTRY],
});

const LEASE_CLEANUP_CYCLES_TOTAL = new client.Counter({
	name: "discovery_lease_cleanup_cycles_total",
	help: "Total lease cleanup cycles executed",
	registers: [METRICS_REGISTRY],
});

import type { HttpStatusCode } from "@trading-model/common/http-status";
import type { HttpMethod } from "@trading-model/validation/contracts/signed-request";

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

export function setActiveWsConnections(count: number): void {
	ACTIVE_CONNECTIONS.set(count);
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

export function incCacheInvalidations(): void {
	CACHE_INVALIDATIONS_TOTAL.inc();
}

export function observeCleanupDuration(durationMs: number): void {
	CLEANUP_DURATION_SECONDS.observe(durationMs / 1000);
}

export function incWsDroppedMessages(): void {
	WS_DROPPED_MESSAGES_TOTAL.inc();
}

export function incOperationError(operation: string): void {
	OPERATION_ERRORS_TOTAL.inc({ operation });
}

export function incLeaseCleanupCycle(): void {
	LEASE_CLEANUP_CYCLES_TOTAL.inc();
}

export const METRICS_HANDLER: RequestHandler = async (_req, res) => {
	res.setHeader("Content-Type", METRICS_REGISTRY.contentType);
	res.end(await METRICS_REGISTRY.metrics());
};

export { METRICS_REGISTRY };
