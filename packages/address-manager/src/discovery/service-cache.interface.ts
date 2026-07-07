import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";

export interface CircuitState {
	failures: number;
	lastFailureTime: number;
	state: "closed" | "open" | "half-open";
}

export interface CacheSetEntry {
	serviceName: ServiceId;
	instance: ServiceInstance;
	region?: string;
	version?: number;
}

export interface IServiceCache {
	get(serviceName: ServiceId, region?: string): Promise<ServiceInstance | null>;
	set(entry: CacheSetEntry): Promise<void>;
	invalidate(serviceName: ServiceId, region?: string): Promise<void>;
	clear(): Promise<void>;
	entries(): Promise<
		Array<{
			serviceName: ServiceId;
			instance: ServiceInstance;
			region?: string;
		}>
	>;
	/** Return the cached version for a service, or 0 if not cached / stale. */
	getVersion(serviceName: ServiceId, region?: string): Promise<number>;
	stop(): void;
}

export const NULL_SERVICE_CACHE: IServiceCache = {
	get: async () => null,
	set: async () => {},
	invalidate: async () => {},
	clear: async () => {},
	entries: async () => [],
	getVersion: async () => 0,
	stop: () => {},
};
