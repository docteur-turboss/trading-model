import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import { DurationMs } from "@trading-model/primitives/primitives";

const CLOCK_SKEW_TOLERANCE_MS = DurationMs.of(2000);

// Since when this process can receive heartbeats: its start, or the moment its
// store came back. 0: never set (in-memory store, tests), leases age from their heartbeat.
let registryAvailableSince = 0;

/** Call when the registry starts, or its store answers again after an outage. */
export function markRegistryAvailable(now: number = Date.now()): void {
	registryAvailableSince = now;
}

/**
 * A lease expires one TTL after its last heartbeat. Silence the registry itself
 * caused (restart, Redis outage) does not count: every instance gets one TTL
 * to renew after the registry is back, or a release that restarts Redis and
 * discovery made live services "not found" for the gateway (CI run 43376893956).
 */
export function isExpiredInstance(
	instance: ServiceInstance,
	now: number
): boolean {
	const since = Math.max(instance.lastHeartbeat, registryAvailableSince);
	return now - since > instance.ttl + CLOCK_SKEW_TOLERANCE_MS;
}

export function isAliveInstance(instance: ServiceInstance): boolean {
	return !isExpiredInstance(instance, Date.now());
}
