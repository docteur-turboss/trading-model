import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type {
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import promClient from "prom-client";

const circuitBreakerStates = Object.values(CircuitState)
	.map((state, index) => `${index}=${state}`)
	.join(", ");

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
	help: `Circuit breaker state per instance (${circuitBreakerStates})`,
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
	serviceName: ServiceId;
	startTime: UnixTimestamp;
}

export const DiscoveryResult = {
	Success: "success",
	Failure: "failure",
	Degraded: "degraded",
} as const;

export type DiscoveryResult =
	(typeof DiscoveryResult)[keyof typeof DiscoveryResult];

export function recordDiscoveryMetrics(
	{ serviceName, startTime }: DiscoveryContext,
	result: DiscoveryResult
): void {
	DISCOVERY_CALLS_TOTAL.inc({ serviceName, result });
	DISCOVERY_DURATION_MS.observe({ serviceName }, Date.now() - startTime);
}
