import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { DurationMs } from "@trading-model/primitives/primitives";

export interface ResponseCacheEntry<TData = unknown> {
	data: TData;
	status: HttpStatusCode;
	/** JSON body length in UTF-16 code units (not bytes), counted against `MAX_BYTES`. */
	chars?: number;
	expiresAt: number;
}

/** Keys carry the client's query string: without a bound, distinct queries grow the cache until restart. */
const MAX_ENTRIES = 1000;
/** The pod has 256Mi: a parsed body takes a few times its JSON length. */
const MAX_BYTES = 32 * 1024 * 1024;

export class ResponseCache {
	private readonly _store = new Map<string, ResponseCacheEntry>();
	private _bytes = 0;

	private readonly _defaultTtlMs: DurationMs;

	constructor(defaultTtlMs: DurationMs) {
		this._defaultTtlMs = defaultTtlMs;
	}

	get<TData = unknown>(key: string): ResponseCacheEntry<TData> | undefined {
		const entry = this._store.get(key);
		if (!entry) {
			return;
		}

		if (Date.now() > entry.expiresAt) {
			this._remove(key);
			return;
		}

		return entry as ResponseCacheEntry<TData>;
	}

	set<TData = unknown>(
		key: string,
		value: Omit<ResponseCacheEntry<TData>, "expiresAt">
	): void {
		this._remove(key);
		const bytes = value.chars ?? 0;
		if (bytes > MAX_BYTES) {
			return;
		}
		// Map keeps insertion order: drop the oldest entries first.
		while (this._store.size >= MAX_ENTRIES || this._bytes + bytes > MAX_BYTES) {
			this._remove(this._store.keys().next().value as string);
		}
		this._store.set(key, {
			...value,
			expiresAt: Date.now() + this._defaultTtlMs,
		});
		this._bytes += bytes;
	}

	private _remove(key: string): void {
		this._bytes -= this._store.get(key)?.chars ?? 0;
		this._store.delete(key);
	}
}
