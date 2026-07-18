import type { ISyncCache } from "./cache";

interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

export class TtlCacheBase<T> implements ISyncCache<T> {
	protected readonly _store = new Map<string, CacheEntry<T>>();
	protected readonly _defaultTtlMs: number;

	constructor(defaultTtlMs: number) {
		this._defaultTtlMs = defaultTtlMs;
	}

	entries(): Array<{ key: string; value: T }> {
		const result: Array<{ key: string; value: T }> = [];
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

	protected _isExpired(entry: CacheEntry<T>): boolean {
		return this._defaultTtlMs > 0 && Date.now() >= entry.expiresAt;
	}

	has(key: string): boolean {
		const entry = this._store.get(key);
		if (!entry) {
			return false;
		}
		if (this._isExpired(entry)) {
			this._store.delete(key);
			return false;
		}
		return true;
	}

	get(key: string): T | undefined {
		const entry = this._store.get(key);
		if (!entry) {
			return;
		}
		if (this._isExpired(entry)) {
			this._store.delete(key);
			return;
		}
		return entry.value;
	}

	set(key: string, value: T, ttlMs?: number): void {
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
