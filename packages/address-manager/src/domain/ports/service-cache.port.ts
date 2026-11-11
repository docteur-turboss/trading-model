import type { CircuitState as CircuitStateEnum } from "@trading-model/primitives/circuit-state";
import type {
	PositiveInt,
	Region,
	ServiceId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { ServiceInstance } from "../client/type";
import type { CircuitStateStorePort } from "./circuit-state-store.port";

/** Circuit breaker state as persisted: failures, last failure time and state. */
export interface PersistedCircuitState {
	failures: PositiveInt;
	lastFailureTime: UnixTimestamp;
	state: CircuitStateEnum;
}

/** Entry stored in the service cache. */
export interface CacheSetEntry {
	serviceName: ServiceId;
	instance: ServiceInstance;
	region?: Region;
}

/** Port of the service cache of discovered instances. */
export interface ServiceCachePort {
	/** Circuit-breaker state store used by this cache, so the cache can
	 * compose (rather than inherit) the parallel circuit-state hierarchy. */
	readonly circuitStateStore: CircuitStateStorePort;
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
	close(): void;
}
