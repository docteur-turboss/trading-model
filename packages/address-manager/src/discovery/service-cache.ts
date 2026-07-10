import type { InstanceId, ServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import { CacheStore } from "./cache-store";
import { CircuitStateStore } from "./circuit-state-store";
import type {
	CacheSetEntry,
	CircuitState,
	IServiceCache,
} from "./service-cache.interface";

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

	private async _withLock<TValue>(fn: () => TValue): Promise<TValue> {
		const release = await this._mutex.acquire();
		try {
			return fn();
		} finally {
			release();
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
	invalidate(serviceName: ServiceId, region?: string): Promise<void> {
		return this.delete(serviceName, region);
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
		return this._withLock(() => this._cacheStore.entries());
	}
	getVersion(_serviceName: ServiceId, _region?: string): Promise<number> {
		return Promise.resolve(0);
	}
	stop(): void {
		this._cacheStore.stop();
	}
	setCircuitState(instanceId: InstanceId, state: CircuitState): Promise<void> {
		return this._circuitStore.setCircuitState(instanceId, state);
	}
	getCircuitState(instanceId: InstanceId): Promise<CircuitState | null> {
		return this._circuitStore.getCircuitState(instanceId);
	}
	deleteCircuitState(instanceId: InstanceId): Promise<void> {
		return this._circuitStore.deleteCircuitState(instanceId);
	}
}
