import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
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

	get(serviceName: string): ServiceInstance[] | undefined {
		return this._cache.get(serviceName);
	}

	set(serviceName: string, instances: ServiceInstance[], ttlMs?: number): void {
		this._cache.set(serviceName, instances, ttlMs);
		this._staleData.set(serviceName, instances);
	}

	getStale(serviceName: string): ServiceInstance[] | undefined {
		return this._staleData.get(serviceName);
	}

	delete(serviceName: string): void {
		this._cache.delete(serviceName);
		this._staleData.delete(serviceName);
	}

	invalidate(serviceName: string): void {
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
