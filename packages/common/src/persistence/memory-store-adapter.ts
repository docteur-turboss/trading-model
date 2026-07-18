import type { IStoreAdapter } from "./store-adapter.interface";

interface Entry<T> {
	value: T;
	expiresAt: number;
}

export class MemoryStoreAdapter<T> implements IStoreAdapter<T> {
	private readonly _store = new Map<string, Entry<T>>();

	private _isExpired(entry: Entry<T>): boolean {
		return entry.expiresAt > 0 && Date.now() > entry.expiresAt;
	}

	async get(key: string): Promise<T | null> {
		const entry = this._store.get(key);
		if (!entry) {
			return null;
		}
		if (this._isExpired(entry)) {
			this._store.delete(key);
			return null;
		}
		return entry.value;
	}

	async set(key: string, value: T, ttlMs?: number): Promise<void> {
		this._store.set(key, {
			value,
			expiresAt: ttlMs ? Date.now() + ttlMs : 0,
		});
	}

	async delete(key: string): Promise<void> {
		this._store.delete(key);
	}

	async clear(): Promise<void> {
		this._store.clear();
	}
}
