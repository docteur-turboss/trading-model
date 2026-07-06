import type { CacheConfig } from "./cache-config";

export class LruCache<TValue> {
	private readonly _maxSize: number;
	private readonly _ttlMs: number;
	private readonly _store = new Map<
		string,
		{ value: TValue; expiresAt: number }
	>();

	constructor(config: CacheConfig = { maxSize: 1000, ttlMs: 60000 }) {
		this._maxSize = config.maxSize;
		this._ttlMs = config.ttlMs ?? 60000;
	}

	has(key: string): boolean {
		const entry = this._store.get(key);
		if (!entry) {
			return false;
		}
		if (this._ttlMs > 0 && Date.now() > entry.expiresAt) {
			this._store.delete(key);
			return false;
		}
		return true;
	}

	get(key: string): TValue | undefined {
		const entry = this._store.get(key);
		if (!entry) {
			return;
		}
		if (this._ttlMs > 0 && Date.now() > entry.expiresAt) {
			this._store.delete(key);
			return;
		}
		this._store.delete(key);
		this._store.set(key, entry);
		return entry.value;
	}

	private _evictIfNeeded(key: string): void {
		if (this._store.has(key)) {
			this._store.delete(key);
		} else if (this._store.size >= this._maxSize) {
			const oldest = this._store.keys().next();
			if (!oldest.done) {
				this._store.delete(oldest.value);
			}
		}
	}

	set(key: string, value: TValue): void {
		this._evictIfNeeded(key);
		this._store.set(key, {
			value,
			expiresAt:
				this._ttlMs > 0 ? Date.now() + this._ttlMs : Number.POSITIVE_INFINITY,
		});
	}

	delete(key: string): void {
		this._store.delete(key);
	}

	get size(): number {
		return this._store.size;
	}

	clear(): void {
		this._store.clear();
	}
}
