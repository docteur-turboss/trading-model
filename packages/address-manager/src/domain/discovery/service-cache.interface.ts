import type { CircuitState as CircuitStateEnum } from "@trading-model/common/domain/circuit-state";
import type {
	PositiveInt,
	Region,
	ServiceId,
	UnixTimestamp,
	Version,
} from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { ICircuitStateStore } from "./circuit-state-store.interface";

export interface PersistedCircuitState {
	failures: PositiveInt;
	lastFailureTime: UnixTimestamp;
	state: CircuitStateEnum;
}

export interface CacheSetEntry {
	serviceName: ServiceId;
	instance: ServiceInstance;
	region?: Region;
	version?: Version;
}

export interface IServiceCache {
	/** Circuit-breaker state store used by this cache, so the cache can
	 * compose (rather than inherit) the parallel circuit-state hierarchy. */
	readonly circuitStateStore: ICircuitStateStore;
	get(serviceName: ServiceId, region?: string): Promise<ServiceInstance | null>;
	set(entry: CacheSetEntry): Promise<void>;
	delete(serviceName: ServiceId, region?: string): Promise<void>;
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
	close(): void;
}
