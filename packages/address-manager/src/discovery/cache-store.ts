import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { CacheSetEntry } from "./service-cache.interface";
import type { ServiceCacheEntry } from "./type";

/**
 * In-memory cache store for service instances.
 *
 * CRUD pattern:
 *   - Create/Update: `set(entry)`
 *   - Read:          `get(serviceName)`, `entries()`
 *   - Delete:        `invalidate(serviceName)` / `delete(serviceName)` (alias)
 *   - Clear:         `clear()`
 *
 * @see IServiceCache — async interface with circuit-breaker support
 * @see InstanceStore — server-side instance registry (discovery-server)
 */
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

	/**
	 * @deprecated Use `invalidate` instead.
	 * Alias provided for naming consistency with other cache implementations.
	 */
	delete(serviceName: ServiceId): void {
		this.invalidate(serviceName);
	}

	clear(): void {
		this._cache.clear();
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
