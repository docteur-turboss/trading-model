import type { CacheConfig } from "@trading-model/common/utils/cache-config";

interface CacheEntry<TValue> {
	value: TValue;
	expiresAt: number;
}

export class LruCache<TValue> {
	private readonly _maxSize: number;
	private readonly _ttlMs: number;
	private readonly _map = new Map<string, CacheEntry<TValue>>();

	constructor(config: CacheConfig = { maxSize: 1000, ttlMs: 60000 }) {
		this._maxSize = config.maxSize;
		this._ttlMs = config.ttlMs ?? 60000;
	}

	get(key: string): TValue | undefined {
		const entry = this._map.get(key);
		if (!entry) {
			return;
		}
		if (Date.now() > entry.expiresAt) {
			this._map.delete(key);
			return;
		}
		this._map.delete(key);
		this._map.set(key, entry);
		return entry.value;
	}

	set(key: string, value: TValue): void {
		if (this._map.has(key)) {
			this._map.delete(key);
		} else if (this._map.size >= this._maxSize) {
			const firstKey = this._map.keys().next().value;
			if (firstKey !== undefined) {
				this._map.delete(firstKey);
			}
		}
		this._map.set(key, { value, expiresAt: Date.now() + this._ttlMs });
	}

	clear(): void {
		this._map.clear();
	}

	get size(): number {
		return this._map.size;
	}
}
