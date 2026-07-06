import type { ServiceInstance } from "../client/type";
import type { CacheSetEntry, CircuitState, IServiceCache } from "./service-cache.interface";
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

export class ServiceCache implements IServiceCache {
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
	private async _withLock<TValue>(
		fn: () => TValue,
	): Promise<TValue> {
		const release = await this._mutex.acquire();
		try {
			return fn();
		} finally {
			release();
		}
	}

	async get(serviceName: string, _region?: string): Promise<ServiceInstance | null> {
		return this._withLock(() => this._getEntry(serviceName));
	}

	private _getEntry(serviceName: string): ServiceInstance | null {
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

	/**
	 * Stores or updates a service instance in the cache.
	 *
	 * - Sets the TTL for the cache entry.
	 * - Replaces any existing entry for the same service.
	 *
	 * @example
	 * ```ts
	 * cache.set({ serviceName: "user-service", instance });
	 * ```
	 */
	async set(entry: CacheSetEntry): Promise<void> {
		return this._withLock(() => {
			this._cache.set(entry.serviceName, {
				instance: entry.instance,
				expiresAt: Date.now() + this._ttlMs,
			});
		});
	}

	async invalidate(serviceName: string, _region?: string): Promise<void> {
		return this._withLock(() => {
			this._cache.delete(serviceName);
		});
	}

	async clear(): Promise<void> {
		return this._withLock(() => {
			this._cache.clear();
		});
	}

	private _isExpired(entry: CacheEntry): boolean {
		return Date.now() >= entry.expiresAt;
	}

	async entries(): Promise<
		Array<{ serviceName: string; instance: ServiceInstance; region?: string }>
	> {
		return this._withLock(() => this._getEntries());
	}

	private _getEntries(): Array<{ serviceName: string; instance: ServiceInstance }> {
		const result: Array<{ serviceName: string; instance: ServiceInstance }> = [];
		for (const [serviceName, entry] of this._cache) {
			if (!this._isExpired(entry)) {
				result.push({ serviceName, instance: entry.instance });
			}
		}
		return result;
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
