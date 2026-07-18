import type {
	DurationMs,
	InstanceId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { MemoryStoreAdapter } from "@trading-model/common/persistence/index";
import { TtlCacheBase } from "@trading-model/common/utils/ttl-cache-base";
import type { ServiceInstance } from "../client/type";
import type {
	CacheSetEntry,
	IServiceCache,
	PersistedCircuitState,
} from "./service-cache.interface";

export class ServiceCache implements IServiceCache {
	private readonly _cacheStore: TtlCacheBase<ServiceInstance>;
	private _mutexPromise: Promise<void> = Promise.resolve();
	private readonly _circuitStore =
		new MemoryStoreAdapter<PersistedCircuitState>();

	constructor(ttlMs: DurationMs) {
		this._cacheStore = new TtlCacheBase(ttlMs);
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
				serviceName: key as unknown as ServiceId,
				instance: value,
			}))
		);
	}
	getVersion(_serviceName: ServiceId, _region?: string): Promise<number> {
		return Promise.resolve(0);
	}
	close(): void {
		this._cacheStore.close();
	}
	setCircuitState(
		instanceId: InstanceId,
		state: PersistedCircuitState
	): Promise<void> {
		return this._circuitStore.set(instanceId, state);
	}
	getCircuitState(
		instanceId: InstanceId
	): Promise<PersistedCircuitState | null> {
		return this._circuitStore.get(instanceId);
	}
	deleteCircuitState(instanceId: InstanceId): Promise<void> {
		return this._circuitStore.delete(instanceId);
	}
}
