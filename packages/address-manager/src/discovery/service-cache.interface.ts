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

	/** Persist circuit breaker state for an instance. */
	setCircuitState(instanceId: string, state: CircuitState): Promise<void>;
	/** Retrieve circuit breaker state for an instance. */
	getCircuitState(instanceId: string): Promise<CircuitState | null>;
	/** Remove circuit breaker state for an instance. */
	deleteCircuitState(instanceId: string): Promise<void>;
}

export class NullServiceCache implements IServiceCache {
	async get(
		_serviceName: ServiceId,
		_region?: string
	): Promise<ServiceInstance | null> {
		return null;
	}
	async set(_entry: CacheSetEntry): Promise<void> {}
	async invalidate(_serviceName: ServiceId, _region?: string): Promise<void> {}
	async clear(): Promise<void> {}
	async entries(): Promise<
		Array<{
			serviceName: ServiceId;
			instance: ServiceInstance;
			region?: string;
		}>
	> {
		return [];
	}
	async getVersion(_serviceName: ServiceId, _region?: string): Promise<number> {
		return 0;
	}
	stop(): void {}
	async setCircuitState(
		_instanceId: string,
		_state: CircuitState
	): Promise<void> {}
	async getCircuitState(_instanceId: string): Promise<CircuitState | null> {
		return null;
	}
	async deleteCircuitState(_instanceId: string): Promise<void> {}
}
