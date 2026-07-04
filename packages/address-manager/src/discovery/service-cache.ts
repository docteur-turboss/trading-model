import type { ServiceInstance } from "../client/type";
import type { CircuitState } from "./service-cache.interface";
import type { CacheEntry } from "./type";

class SimpleMutex {
	private _promise: Promise<void> = Promise.resolve();

	async acquire(): Promise<() => void> {
		let release: () => void;
		const next = new Promise<void>((resolve) => {
			release = resolve;
		});
		const prev = this._promise;
		this._promise = next;
		await prev;
		return release!;
	}
}

export class ServiceCache {
	private readonly _ttlMs: number;
	private readonly _cache: Map<string, CacheEntry>;
	private readonly _mutex = new SimpleMutex();

	constructor(ttlMs: number) {
		this._ttlMs = ttlMs;
		this._cache = new Map();
	}

	/**
	 * Retrieves a service instance from the cache.
	 *
	 * - Returns the cached instance if present and not expired.
	 * - Returns `null` if the instance is missing or expired.
	 *
	 * @param serviceName - Name of the service to retrieve.
	 * @returns A ServiceInstance or `null`.
	 *
	 * @example
	 * ```ts
	 * const instance = cache.get("user-service");
	 * if (!instance) {
	 *   // fetch from service registry
	 * }
	 * ```
	 */
	async get(serviceName: string): Promise<ServiceInstance | null> {
		const release = await this._mutex.acquire();
		try {
			const entry = this._cache.get(serviceName);

			if (!entry) {
				return null;
			}

			if (this._isExpired(entry)) {
				this._cache.delete(serviceName);
				return null;
			}

			return entry.instance;
		} finally {
			release();
		}
	}

	/**
	 * Stores or updates a service instance in the cache.
	 *
	 * - Sets the TTL for the cache entry.
	 * - Replaces any existing entry for the same service.
	 *
	 * @param serviceName - Name of the service.
	 * @param instance - Service instance to store.
	 *
	 * @example
	 * ```ts
	 * cache.set("user-service", instance);
	 * ```
	 */
	async set(serviceName: string, instance: ServiceInstance): Promise<void> {
		const release = await this._mutex.acquire();
		try {
			this._cache.set(serviceName, {
				instance,
				expiresAt: Date.now() + this._ttlMs,
			});
		} finally {
			release();
		}
	}

	/**
	 * Explicitly removes a service instance from the cache.
	 *
	 * - Useful for invalidating outdated or unhealthy entries.
	 *
	 * @param serviceName - Name of the service to remove.
	 *
	 * @example
	 * ```ts
	 * cache.invalidate("user-service");
	 * ```
	 */
	async invalidate(serviceName: string): Promise<void> {
		const release = await this._mutex.acquire();
		try {
			this._cache.delete(serviceName);
		} finally {
			release();
		}
	}

	/**
	 * Clears all entries from the cache.
	 *
	 * - Useful during global events, such as reconnection or full service reset.
	 *
	 * @example
	 * ```ts
	 * cache.clear();
	 * ```
	 */
	async clear(): Promise<void> {
		const release = await this._mutex.acquire();
		try {
			this._cache.clear();
		} finally {
			release();
		}
	}

	/**
	 * Determines if a cache entry has expired.
	 *
	 * @param entry - Cache entry to check.
	 * @returns `true` if expired, `false` otherwise.
	 *
	 * @private
	 */
	private _isExpired(entry: CacheEntry): boolean {
		return Date.now() >= entry.expiresAt;
	}

	async entries(): Promise<
		Array<{ serviceName: string; instance: ServiceInstance; region?: string }>
	> {
		const release = await this._mutex.acquire();
		try {
			const result: Array<{ serviceName: string; instance: ServiceInstance }> =
				[];
			for (const [serviceName, entry] of this._cache) {
				if (!this._isExpired(entry)) {
					result.push({ serviceName, instance: entry.instance });
				}
			}
			return result;
		} finally {
			release();
		}
	}

	getVersion(_serviceName: string, _region?: string): Promise<number> {
		return Promise.resolve(0);
	}

	stop(): void {
		this._cache.clear();
	}

	private readonly _circuitStates = new Map<string, CircuitState>();

	setCircuitState(instanceId: string, state: CircuitState): Promise<void> {
		this._circuitStates.set(instanceId, state);
		return Promise.resolve();
	}

	getCircuitState(instanceId: string): Promise<CircuitState | null> {
		return Promise.resolve(this._circuitStates.get(instanceId) ?? null);
	}

	deleteCircuitState(instanceId: string): Promise<void> {
		this._circuitStates.delete(instanceId);
		return Promise.resolve();
	}
}
