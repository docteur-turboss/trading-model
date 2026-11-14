interface CacheEntry<TValue> {
	value: TValue;
	expiresAt: number;
}

/**
 * In-memory cache with a per-entry TTL. An expired entry is hidden from
 * `get`/`has`/`entries` but kept until overwritten or deleted, so `getStale`
 * can serve it as a last resort: the store is bounded by its key set.
 */
export class TtlCacheBase<TValue> {
	protected readonly _store = new Map<string, CacheEntry<TValue>>();
	protected readonly _defaultTtlMs: number;

	constructor(defaultTtlMs: number) {
		this._defaultTtlMs = defaultTtlMs;
	}

	entries(): Array<{ key: string; value: TValue }> {
		const result: Array<{ key: string; value: TValue }> = [];
		for (const [key, entry] of this._store) {
			if (!this._isExpired(entry)) {
				result.push({ key, value: entry.value });
			}
		}
		return result;
	}

	close(): void {
		this._store.clear();
	}

	protected _isExpired(entry: CacheEntry<TValue>): boolean {
		return Date.now() >= entry.expiresAt;
	}

	private _liveEntry(key: string): CacheEntry<TValue> | undefined {
		const entry = this._store.get(key);
		return entry && !this._isExpired(entry) ? entry : undefined;
	}

	has(key: string): boolean {
		return this._liveEntry(key) !== undefined;
	}

	get(key: string): TValue | undefined {
		return this._liveEntry(key)?.value;
	}

	/** Returns the last value set for `key`, even expired. */
	getStale(key: string): TValue | undefined {
		return this._store.get(key)?.value;
	}

	set(key: string, value: TValue, ttlMs?: number): void {
		const effectiveTtl = ttlMs ?? this._defaultTtlMs;
		this._store.set(key, {
			value,
			expiresAt:
				effectiveTtl > 0 ? Date.now() + effectiveTtl : Number.POSITIVE_INFINITY,
		});
	}

	delete(key: string): void {
		this._store.delete(key);
	}

	clear(): void {
		this._store.clear();
	}
}
