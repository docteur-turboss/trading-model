import type { IStoreAdapter } from "./store-adapter.interface";

export class BackendStore<T> {
	constructor(private readonly _adapter: IStoreAdapter<T>) {}

	get(key: string): Promise<T | null> {
		return this._adapter.get(key);
	}

	set(key: string, value: T, ttlMs?: number): Promise<void> {
		return this._adapter.set(key, value, ttlMs);
	}

	delete(key: string): Promise<void> {
		return this._adapter.delete(key);
	}

	clear(): Promise<void> {
		return this._adapter.clear?.() ?? Promise.resolve();
	}
}
