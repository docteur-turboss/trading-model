import type { Region, ServiceId } from "@trading-model/primitives/primitives";
import type { ServiceInstance } from "../client/type";

/** Entry stored in the service cache. */
export interface CacheSetEntry {
	serviceName: ServiceId;
	instance: ServiceInstance;
	region?: Region;
}

/** Port of the service cache of discovered instances. */
export interface ServiceCachePort {
	get(serviceName: ServiceId, region?: string): Promise<ServiceInstance | null>;
	/** Last instance cached for `serviceName`, even past its TTL: discovery-outage fallback only. */
	getStale(serviceName: ServiceId): Promise<ServiceInstance | null>;
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
