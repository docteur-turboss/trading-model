export interface CacheEntry<TData = unknown> {
	data: TData;
	status: number;
	expiresAt: number;
}

export class ResponseCache {
	private readonly _store = new Map<string, CacheEntry>();

	private readonly _defaultTtlMs: number;

	constructor(defaultTtlMs: number) {
		this._defaultTtlMs = defaultTtlMs;
	}

	get<TData = unknown>(key: string): CacheEntry<TData> | undefined {
		const entry = this._store.get(key);
		if (!entry) {
			return;
		}

		if (Date.now() > entry.expiresAt) {
			this._store.delete(key);
			return;
		}

		return entry as CacheEntry<TData>;
	}

	set<TData = unknown>(
		key: string,
		data: TData,
		status: number,
		ttlMs?: number
	): void {
		this._store.set(key, {
			data,
			status,
			expiresAt: Date.now() + (ttlMs ?? this._defaultTtlMs),
		});
	}

	invalidate(pattern: string): void {
		const regex = new RegExp(
			pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")
		);

		for (const key of this._store.keys()) {
			if (regex.test(key)) {
				this._store.delete(key);
			}
		}
	}

	clear(): void {
		this._store.clear();
	}

	get size(): number {
		return this._store.size;
	}
}
