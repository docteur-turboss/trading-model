import promClient from "prom-client";

export const DISCOVERY_CALLS_TOTAL = new promClient.Counter({
	name: "address_manager_discovery_calls_total",
	help: "Total number of service discovery calls",
	labelNames: ["serviceName", "result"] as const,
});

export const DISCOVERY_DURATION_MS = new promClient.Histogram({
	name: "address_manager_discovery_duration_ms",
	help: "Duration of service discovery calls in ms",
	labelNames: ["serviceName"] as const,
	buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});

export const REGISTRATION_TOTAL = new promClient.Counter({
	name: "address_manager_registration_total",
	help: "Total number of service registration attempts",
	labelNames: ["result"] as const,
});

export const HEARTBEAT_TOTAL = new promClient.Counter({
	name: "address_manager_heartbeat_total",
	help: "Total number of heartbeat attempts",
	labelNames: ["result"] as const,
});

export const CIRCUIT_BREAKER_STATE = new promClient.Gauge({
	name: "address_manager_circuit_breaker_state",
	help: "Circuit breaker state per instance (0=closed, 1=open, 2=half-open)",
	labelNames: ["instanceId"] as const,
});

export const CIRCUIT_BREAKER_INSTANCES_TOTAL = new promClient.Gauge({
	name: "address_manager_circuit_breaker_instances_total",
	help: "Circuit breaker instance count by state",
	labelNames: ["state"] as const,
});

export const CACHE_ENTRY_COUNT = new promClient.Gauge({
	name: "address_manager_cache_entries_total",
	help: "Current number of cache entries by service",
	labelNames: [] as const,
});

export interface DiscoveryContext {
	serviceName: string;
	startTime: number;
}

export function recordDiscoveryMetrics(
	{ serviceName, startTime }: DiscoveryContext,
	result: "success" | "failure" | "degraded"
): void {
	DISCOVERY_CALLS_TOTAL.inc({ serviceName, result });
	DISCOVERY_DURATION_MS.observe({ serviceName }, Date.now() - startTime);
}
