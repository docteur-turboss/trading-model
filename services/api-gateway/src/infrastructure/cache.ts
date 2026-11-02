import type { ISyncCache } from "@trading-model/common/utils/cache";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { DurationMs } from "@trading-model/primitives/primitives";
import { CACHE_HIT_RATIO, CACHE_SIZE } from "./config/metrics";

export interface ResponseCacheEntry<TData = unknown> {
	data: TData;
	status: HttpStatusCode;
	expiresAt: number;
}

export class ResponseCache implements ISyncCache<ResponseCacheEntry> {
	private readonly _store = new Map<string, ResponseCacheEntry>();
	private _hits = 0;
	private _total = 0;

	private readonly _defaultTtlMs: DurationMs;

	constructor(defaultTtlMs: DurationMs) {
		this._defaultTtlMs = defaultTtlMs;
	}

	get<TData = unknown>(key: string): ResponseCacheEntry<TData> | undefined {
		this._total++;
		const entry = this._store.get(key);
		if (!entry) {
			this._recordHitRatio();
			return;
		}

		if (Date.now() > entry.expiresAt) {
			this._store.delete(key);
			this._recordHitRatio();
			return;
		}

		this._hits++;
		this._recordHitRatio();
		return entry as ResponseCacheEntry<TData>;
	}

	private _recordHitRatio(): void {
		CACHE_HIT_RATIO.set(this._hits / this._total);
	}

	set<TData = unknown>(
		key: string,
		value: Omit<ResponseCacheEntry<TData>, "expiresAt">,
		ttlMs?: DurationMs
	): void {
		this._store.set(key, {
			...value,
			expiresAt: Date.now() + (ttlMs ?? this._defaultTtlMs),
		});
		CACHE_SIZE.set(this._store.size);
	}

	delete(key: string): void {
		this._store.delete(key);
		CACHE_SIZE.set(this._store.size);
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
		CACHE_SIZE.set(this._store.size);
	}

	clear(): void {
		this._store.clear();
		CACHE_SIZE.set(this._store.size);
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
