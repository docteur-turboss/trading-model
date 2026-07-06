import type { ServiceInstance } from "../client/type";

export interface CircuitState {
	failures: number;
	lastFailureTime: number;
	state: "closed" | "open" | "half-open";
}

export interface IServiceCache {
	get(serviceName: string, region?: string): Promise<ServiceInstance | null>;
	set(
		serviceName: string,
		instance: ServiceInstance,
		region?: string,
		version?: number
	): Promise<void>;
	invalidate(serviceName: string, region?: string): Promise<void>;
	clear(): Promise<void>;
	entries(): Promise<
		Array<{ serviceName: string; instance: ServiceInstance; region?: string }>
	>;
	/** Return the cached version for a service, or 0 if not cached / stale. */
	getVersion(serviceName: string, region?: string): Promise<number>;
	stop(): void;

	/** Persist circuit breaker state for an instance. */
	setCircuitState(instanceId: string, state: CircuitState): Promise<void>;
	/** Retrieve circuit breaker state for an instance. */
	getCircuitState(instanceId: string): Promise<CircuitState | null>;
	/** Remove circuit breaker state for an instance. */
	deleteCircuitState(instanceId: string): Promise<void>;
}

export class NullServiceCache implements IServiceCache {
	async get(_serviceName: string, _region?: string): Promise<ServiceInstance | null> {
		return null;
	}
	async set(_serviceName: string, _instance: ServiceInstance, _region?: string, _version?: number): Promise<void> {}
	async invalidate(_serviceName: string, _region?: string): Promise<void> {}
	async clear(): Promise<void> {}
	async entries(): Promise<Array<{ serviceName: string; instance: ServiceInstance; region?: string }>> {
		return [];
	}
	async getVersion(_serviceName: string, _region?: string): Promise<number> {
		return 0;
	}
	stop(): void {}
	async setCircuitState(_instanceId: string, _state: CircuitState): Promise<void> {}
	async getCircuitState(_instanceId: string): Promise<CircuitState | null> {
		return null;
	}
	async deleteCircuitState(_instanceId: string): Promise<void> {}
}
