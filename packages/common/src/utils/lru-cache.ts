import type { CacheConfig } from "./cache-config";
import { TtlCacheBase } from "./ttl-cache-base";

export class LruCache<TValue> extends TtlCacheBase<TValue> {
	private readonly _maxSize: number;

	constructor(config: CacheConfig = { maxSize: 1000, ttlMs: 60000 as never }) {
		super(config.ttlMs ?? 60000);
		this._maxSize = config.maxSize;
	}

	has(key: string): boolean {
		if (!super.has(key)) {
			return false;
		}
		const entry = this._store.get(key);
		if (entry) {
			this._touch(key, entry);
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

	private _touchAndReturn(
		key: string,
		entry: { value: TValue; expiresAt: number }
	): TValue {
		this._store.delete(key);
		this._store.set(key, entry);
		return entry.value;
	}

	private _touch(
		key: string,
		entry: { value: TValue; expiresAt: number }
	): void {
		this._store.delete(key);
		this._store.set(key, entry);
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
		super.set(key, value, ttlMs);
	}

	get size(): number {
		return this._store.size;
	}
}
