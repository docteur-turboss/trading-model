import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { ICache } from "@trading-model/common/utils/cache";
import type { ServiceInstance } from "../client/type";
import type { CacheSetEntry } from "./service-cache.interface";
import type { ServiceCacheEntry } from "./type";

/**
 * In-memory cache store for service instances.
 *
 * Implements the common {@link ICache} interface while also providing
 * domain-specific accessors (`entries()`, `stop()`).
 *
 * @see IServiceCache — async interface with circuit-breaker support
 * @see InstanceStore — server-side instance registry (discovery-server)
 */
export class CacheStore implements ICache<ServiceInstance> {
	private readonly _cache: Map<ServiceId, ServiceCacheEntry>;
	private readonly _ttlMs: number;

	constructor(ttlMs: number) {
		this._ttlMs = ttlMs;
		this._cache = new Map();
	}

	get(key: string): ServiceInstance | undefined {
		const entry = this._cache.get(key as ServiceId);
		if (!entry) {
			return;
		}
		if (this._isExpired(entry)) {
			this._cache.delete(key as ServiceId);
			return;
		}
		return entry.instance;
	}

	set(key: string, value: ServiceInstance, ttlMs?: number): void {
		this._cache.set(key as ServiceId, {
			instance: value,
			expiresAt: Date.now() + (ttlMs ?? this._ttlMs),
		});
	}

	delete(key: string): void {
		this._cache.delete(key as ServiceId);
	}

	clear(): void {
		this._cache.clear();
	}

	/** Convenience accessor that takes a domain-typed key. */
	getByServiceName(serviceName: ServiceId): ServiceInstance | undefined {
		return this.get(serviceName);
	}

	/** Convenience accessor that takes a domain-typed key and value. */
	setEntry(entry: CacheSetEntry): void {
		this.set(entry.serviceName, entry.instance, this._ttlMs);
	}

	/** @deprecated Use {@link delete} instead, matching ICache convention. */
	invalidate(serviceName: ServiceId): void {
		this.delete(serviceName);
	}

	entries(): Array<{ serviceName: ServiceId; instance: ServiceInstance }> {
		const result: Array<{ serviceName: ServiceId; instance: ServiceInstance }> =
			[];
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
