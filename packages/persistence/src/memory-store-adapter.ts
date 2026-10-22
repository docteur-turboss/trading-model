import type { IStoreAdapter } from "./store-adapter.interface";

interface Entry<TValue> {
	value: TValue;
	expiresAt: number;
}

export class MemoryStoreAdapter<TValue> implements IStoreAdapter<TValue> {
	private readonly _store = new Map<string, Entry<TValue>>();

	private _isExpired(entry: Entry<TValue>): boolean {
		return entry.expiresAt > 0 && Date.now() > entry.expiresAt;
	}

	get(key: string): Promise<TValue | null> {
		const entry = this._store.get(key);
		if (!entry) {
			return Promise.resolve(null);
		}
		if (this._isExpired(entry)) {
			this._store.delete(key);
			return Promise.resolve(null);
		}
		return Promise.resolve(entry.value);
	}

	set(key: string, value: TValue, ttlMs?: number): Promise<void> {
		this._store.set(key, {
			value,
			expiresAt: ttlMs ? Date.now() + ttlMs : 0,
		});
		return Promise.resolve();
	}

	delete(key: string): Promise<void> {
		this._store.delete(key);
		return Promise.resolve();
	}

	clear(): Promise<void> {
		this._store.clear();
		return Promise.resolve();
	}
}
