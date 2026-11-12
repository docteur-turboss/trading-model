import { TtlCacheBase } from "@trading-model/common/utils/ttl-cache-base";
import { MemoryStoreAdapter } from "@trading-model/persistence/memory-store-adapter";
import {
	type DurationMs,
	type ServiceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import type { ServiceInstance } from "../../../domain/client/type";
import type { CircuitStateStorePort } from "../../../domain/ports/circuit-state-store.port";
import type {
	CacheSetEntry,
	PersistedCircuitState,
	ServiceCachePort,
} from "../../../domain/ports/service-cache.port";

/** Cache of discovered service instances with a TTL, writes serialized by a mutex. */
export class ServiceCache implements ServiceCachePort {
	private readonly _cacheStore: TtlCacheBase<ServiceInstance>;
	private _mutexPromise: Promise<void> = Promise.resolve();
	readonly circuitStateStore: CircuitStateStorePort;

	constructor(ttlMs: DurationMs) {
		this._cacheStore = new TtlCacheBase(ttlMs);
		const circuitStore = new MemoryStoreAdapter<PersistedCircuitState>();
		this.circuitStateStore = {
			setCircuitState: (id, state) => circuitStore.set(id, state),
			getCircuitState: (id) => circuitStore.get(id),
			deleteCircuitState: (id) => circuitStore.delete(id),
		};
	}

	private async _withLock<TValue>(fn: () => TValue): Promise<TValue> {
		let release: () => void;
		const next = new Promise<void>((resolve) => {
			release = resolve;
		});
		const prev = this._mutexPromise;
		this._mutexPromise = next;
		await prev;
		try {
			return fn();
		} finally {
			release!();
		}
	}

	get(
		serviceName: ServiceId,
		_region?: string
	): Promise<ServiceInstance | null> {
		return this._withLock(() => this._cacheStore.get(serviceName) ?? null);
	}
	getStale(serviceName: ServiceId): Promise<ServiceInstance | null> {
		return this._withLock(() => this._cacheStore.getStale(serviceName) ?? null);
	}
	set(entry: CacheSetEntry): Promise<void> {
		return this._withLock(() => {
			this._cacheStore.set(entry.serviceName, entry.instance);
		});
	}
	delete(serviceName: ServiceId, _region?: string): Promise<void> {
		return this._withLock(() => {
			this._cacheStore.delete(serviceName);
		});
	}

	clear(): Promise<void> {
		return this._withLock(() => {
			this._cacheStore.clear();
		});
	}
	entries(): Promise<
		Array<{
			serviceName: ServiceId;
			instance: ServiceInstance;
			region?: string;
		}>
	> {
		return this._withLock(() =>
			this._cacheStore.entries().map(({ key, value }) => ({
				serviceName: toServiceId(key),
				instance: value,
			}))
		);
	}
	close(): void {
		this._cacheStore.close();
	}
}
