import { CircuitState } from "@trading-model/primitives/circuit-state";
import type {
	ServiceId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import promClient from "prom-client";

const circuitBreakerStates = Object.values(CircuitState)
	.map((state, index) => `${index}=${state}`)
	.join(", ");

/** Counter of discovery calls by service and result. */
export const DISCOVERY_CALLS_TOTAL = new promClient.Counter({
	name: "address_manager_discovery_calls_total",
	help: "Total number of service discovery calls",
	labelNames: ["serviceName", "result"] as const,
});

/** Histogram of discovery call duration, in milliseconds. */
export const DISCOVERY_DURATION_MS = new promClient.Histogram({
	name: "address_manager_discovery_duration_ms",
	help: "Duration of service discovery calls in ms",
	labelNames: ["serviceName"] as const,
	buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});

/** Counter of registration attempts by result. */
export const REGISTRATION_TOTAL = new promClient.Counter({
	name: "address_manager_registration_total",
	help: "Total number of service registration attempts",
	labelNames: ["result"] as const,
});

/** Counter of heartbeats by result. */
export const HEARTBEAT_TOTAL = new promClient.Counter({
	name: "address_manager_heartbeat_total",
	help: "Total number of heartbeat attempts",
	labelNames: ["result"] as const,
});

/** Gauge of the state of each circuit breaker. */
export const CIRCUIT_BREAKER_STATE = new promClient.Gauge({
	name: "address_manager_circuit_breaker_state",
	help: `Circuit breaker state per instance (${circuitBreakerStates})`,
	labelNames: ["instanceId"] as const,
});

/** Gauge of the circuit breaker instances tracked. */
export const CIRCUIT_BREAKER_INSTANCES_TOTAL = new promClient.Gauge({
	name: "address_manager_circuit_breaker_instances_total",
	help: "Circuit breaker instance count by state",
	labelNames: ["state"] as const,
});

/** Gauge of the entries in the service cache. */
export const CACHE_ENTRY_COUNT = new promClient.Gauge({
	name: "address_manager_cache_entries_total",
	help: "Current number of cache entries by service",
	labelNames: [] as const,
});

/** Labels of a discovery metric: service name and start time. */
export interface DiscoveryContext {
	serviceName: ServiceId;
	startTime: UnixTimestamp;
}

/** Outcome of a discovery call, as a metric label. */
export enum DiscoveryResult {
	Success = "success",
	Failure = "failure",
	Degraded = "degraded",
}

/** Records one discovery call in the discovery metrics. */
export function recordDiscoveryMetrics(
	{ serviceName, startTime }: DiscoveryContext,
	result: DiscoveryResult
): void {
	DISCOVERY_CALLS_TOTAL.inc({ serviceName, result });
	DISCOVERY_DURATION_MS.observe({ serviceName }, Date.now() - startTime);
}

/** Reports one instance's breaker state (0=closed, 1=open, 2=half-open) and the per-state totals. */
export function recordCircuitState(
	instanceId: string,
	state: CircuitState,
	summary: Record<CircuitState, number>
): void {
	CIRCUIT_BREAKER_STATE.set(
		{ instanceId },
		Object.values(CircuitState).indexOf(state)
	);
	for (const each of Object.values(CircuitState)) {
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set({ state: each }, summary[each]);
	}
}
