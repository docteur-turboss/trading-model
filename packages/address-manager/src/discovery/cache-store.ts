import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { CacheSetEntry } from "./service-cache.interface";
import type { ServiceCacheEntry } from "./type";

export class CacheStore {
	private readonly _cache: Map<ServiceId, ServiceCacheEntry>;
	private readonly _ttlMs: number;

	constructor(ttlMs: number) {
		this._ttlMs = ttlMs;
		this._cache = new Map();
	}

	get(serviceName: ServiceId): ServiceInstance | null {
		const entry = this._cache.get(serviceName);
		if (!entry) {
			return null;
		}
		if (this._isExpired(entry)) {
			this._cache.delete(serviceName);
			return null;
		}
		return entry.instance;
	}

	set(entry: CacheSetEntry): void {
		this._cache.set(entry.serviceName, {
			instance: entry.instance,
			expiresAt: Date.now() + this._ttlMs,
		});
	}

	invalidate(serviceName: ServiceId): void {
		this._cache.delete(serviceName);
	}

	clear(): void {
		this._cache.clear();
	}

	entries(): Array<{ serviceName: ServiceId; instance: ServiceInstance }> {
		const result: Array<{ serviceName: ServiceId; instance: ServiceInstance }> = [];
		for (const [serviceName, entry] of this._cache) {
			if (!this._isExpired(entry)) {
				result.push({ serviceName, instance: entry.instance });
			}
		}
		return result;
	}

	stop(): void {
		this._cache.clear();
	}

	private _isExpired(entry: ServiceCacheEntry): boolean {
		return Date.now() >= entry.expiresAt;
	}
}
