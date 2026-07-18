import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { DurationMs } from "@trading-model/common/domain/primitives";
import type { ISyncCache } from "@trading-model/common/utils/cache";
import type { CacheConfig } from "@trading-model/common/utils/cache-config";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import type { ServiceInstance } from "@trading-model/validation/contracts/service-registry.types";

export class CacheManager implements ISyncCache<ServiceInstance[]> {
	public readonly cache: LruCache<ServiceInstance[]>;
	public readonly staleData: LruCache<ServiceInstance[]>;

	constructor(config: CacheConfig) {
		this.cache = new LruCache<ServiceInstance[]>(config);
		this.staleData = new LruCache<ServiceInstance[]>({
			maxSize: config.maxSize,
		});
	}

	set(
		serviceName: ServiceInstanceName,
		instances: ServiceInstance[],
		ttlMs?: DurationMs
	): void {
		this.cache.set(serviceName, instances, ttlMs);
		this.staleData.set(serviceName, instances);
	}

	delete(serviceName: ServiceInstanceName): void {
		this.cache.delete(serviceName);
		this.staleData.delete(serviceName);
	}

	invalidate(serviceName: ServiceInstanceName): void {
		this.delete(serviceName);
	}

	get(key: string): ServiceInstance[] | undefined {
		return this.cache.get(key);
	}

	clear(): void {
		this.cache.clear();
		this.staleData.clear();
	}
}
