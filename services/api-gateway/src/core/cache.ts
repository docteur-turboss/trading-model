import type { ICache } from "@trading-model/common/utils/cache";

export interface ResponseCacheEntry<TData = unknown> {
	data: TData;
	status: number;
	expiresAt: number;
}

export class ResponseCache implements ICache<ResponseCacheEntry> {
	private readonly _store = new Map<string, ResponseCacheEntry>();

	private readonly _defaultTtlMs: number;

	constructor(defaultTtlMs: number) {
		this._defaultTtlMs = defaultTtlMs;
	}

	get<TData = unknown>(key: string): ResponseCacheEntry<TData> | undefined {
		const entry = this._store.get(key);
		if (!entry) {
			return;
		}

		if (Date.now() > entry.expiresAt) {
			this._store.delete(key);
			return;
		}

		return entry as ResponseCacheEntry<TData>;
	}

	set<TData = unknown>(
		key: string,
		value: Omit<ResponseCacheEntry<TData>, "expiresAt">,
		ttlMs?: number
	): void {
		this._store.set(key, {
			...value,
			expiresAt: Date.now() + (ttlMs ?? this._defaultTtlMs),
		});
	}

	delete(key: string): void {
		this._store.delete(key);
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

	has(key: string): boolean {
		return (
			this._store.has(key) && Date.now() <= this._store.get(key)!.expiresAt
		);
	}

	get size(): number {
		return this._store.size;
	}
}
