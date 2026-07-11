import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import type { DurationMs } from "@trading-model/common/domain/primitives";
import type { ISyncCache } from "@trading-model/common/utils/cache";
import type { CacheConfig } from "@trading-model/common/utils/cache-config";
import { LruCache } from "@trading-model/common/utils/lru-cache";

export class CacheManager implements ISyncCache<ServiceInstance[]> {
	private _cache: LruCache<ServiceInstance[]>;
	private _staleData: LruCache<ServiceInstance[]>;

	constructor(config: CacheConfig) {
		this._cache = new LruCache<ServiceInstance[]>(config);
		this._staleData = new LruCache<ServiceInstance[]>({
			maxSize: config.maxSize,
		});
	}

	get(serviceName: ServiceInstanceName): ServiceInstance[] | undefined {
		return this._cache.get(serviceName);
	}

	set(
		serviceName: ServiceInstanceName,
		instances: ServiceInstance[],
		ttlMs?: DurationMs
	): void {
		this._cache.set(serviceName, instances, ttlMs);
		this._staleData.set(serviceName, instances);
	}

	getStale(serviceName: ServiceInstanceName): ServiceInstance[] | undefined {
		return this._staleData.get(serviceName);
	}

	delete(serviceName: ServiceInstanceName): void {
		this._cache.delete(serviceName);
		this._staleData.delete(serviceName);
	}

	invalidate(serviceName: ServiceInstanceName): void {
		this.delete(serviceName);
	}

	has(key: string): boolean {
		return this._cache.has(key);
	}

	get size(): number {
		return this._cache.size;
	}

	clear(): void {
		this._cache.clear();
		this._staleData.clear();
	}
}
