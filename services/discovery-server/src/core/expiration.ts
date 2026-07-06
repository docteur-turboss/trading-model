import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";

export const CLOCK_SKEW_TOLERANCE_MS = 2000;

export function isExpiredInstance(instance: ServiceInstance, now: number): boolean {
	return now - instance.lastHeartbeat > instance.ttl + CLOCK_SKEW_TOLERANCE_MS;
}

export function isAliveInstance(instance: ServiceInstance): boolean {
	return !isExpiredInstance(instance, Date.now());
}
