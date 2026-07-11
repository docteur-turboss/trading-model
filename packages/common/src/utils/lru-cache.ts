import type { ISyncCache } from "./cache";
import type { CacheConfig } from "./cache-config";

export class LruCache<TValue> implements ISyncCache<TValue> {
	private readonly _maxSize: number;
	private readonly _ttlMs: number;
	private readonly _store = new Map<
		string,
		{ value: TValue; expiresAt: number }
	>();

	constructor(config: CacheConfig = { maxSize: 1000, ttlMs: 60000 as never }) {
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
		if (this._isExpired(entry)) {
			this._store.delete(key);
			return;
		}
		return this._touchAndReturn(key, entry);
	}

	private _isExpired(entry: { value: TValue; expiresAt: number }): boolean {
		return this._ttlMs > 0 && Date.now() > entry.expiresAt;
	}

	private _touchAndReturn(
		key: string,
		entry: { value: TValue; expiresAt: number }
	): TValue {
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

	set(key: string, value: TValue, ttlMs?: number): void {
		this._evictIfNeeded(key);
		const effectiveTtl = ttlMs ?? this._ttlMs;
		this._store.set(key, {
			value,
			expiresAt:
				effectiveTtl > 0 ? Date.now() + effectiveTtl : Number.POSITIVE_INFINITY,
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
