import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { CacheSetEntry, CircuitState, IServiceCache } from "./service-cache.interface";
import { CacheStore } from "./cache-store";
import { CircuitStateStore } from "./circuit-state-store";

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
	private readonly _cacheStore: CacheStore;
	private readonly _mutex = new SimpleMutex();
	private readonly _circuitStore = new CircuitStateStore();

	constructor(ttlMs: number) {
		this._cacheStore = new CacheStore(ttlMs);
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

	async get(serviceName: ServiceId, _region?: string): Promise<ServiceInstance | null> {
		return this._withLock(() => this._cacheStore.get(serviceName));
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
			this._cacheStore.set(entry);
		});
	}

	async invalidate(serviceName: ServiceId, _region?: string): Promise<void> {
		return this._withLock(() => {
			this._cacheStore.invalidate(serviceName);
		});
	}

	async delete(serviceName: ServiceId, region?: string): Promise<void> {
		return this.invalidate(serviceName, region);
	}

	async clear(): Promise<void> {
		return this._withLock(() => {
			this._cacheStore.clear();
		});
	}

	async entries(): Promise<
		Array<{ serviceName: ServiceId; instance: ServiceInstance; region?: string }>
	> {
		return this._withLock(() => this._cacheStore.entries());
	}

	getVersion(_serviceName: ServiceId, _region?: string): Promise<number> {
		return Promise.resolve(0);
	}

	stop(): void {
		this._cacheStore.stop();
	}

	setCircuitState(instanceId: string, state: CircuitState): Promise<void> {
		return this._circuitStore.setCircuitState(instanceId, state);
	}

	getCircuitState(instanceId: string): Promise<CircuitState | null> {
		return this._circuitStore.getCircuitState(instanceId);
	}

	deleteCircuitState(instanceId: string): Promise<void> {
		return this._circuitStore.deleteCircuitState(instanceId);
	}
}
