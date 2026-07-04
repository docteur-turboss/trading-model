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
