import type { CacheConfig } from "@trading-model/common/utils/cache-config";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import { logger } from "@trading-model/common/config/logger";

interface CacheEntry {
	data: ServiceInstance[];
}

export class CacheManager {
	private _cache: LruCache<CacheEntry>;
	private _staleData: LruCache<ServiceInstance[]>;

	constructor(config: CacheConfig) {
		this._cache = new LruCache<CacheEntry>(config);
		this._staleData = new LruCache<ServiceInstance[]>({ maxSize: config.maxSize });
	}

	get(serviceName: string): ServiceInstance[] | undefined {
		const cached = this._cache.get(serviceName);
		return cached?.data;
	}

	set(serviceName: string, instances: ServiceInstance[]): void {
		this._cache.set(serviceName, { data: instances });
		this._staleData.set(serviceName, instances);
	}

	getStale(serviceName: string): ServiceInstance[] | undefined {
		return this._staleData.get(serviceName);
	}

	invalidate(serviceName: string): void {
		this._cache.delete(serviceName);
		this._staleData.delete(serviceName);
	}

	get size(): number {
		return this._cache.size;
	}

	clear(): void {
		this._cache.clear();
		this._staleData.clear();
	}
}
