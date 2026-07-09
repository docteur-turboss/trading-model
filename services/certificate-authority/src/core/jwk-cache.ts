import type { KeyObject } from "node:crypto";

interface ParsedJwk {
	kid: string;
	key: KeyObject;
}

export class JwkCache {
	private _cachedKeys: Map<string, KeyObject> = new Map();
	private _lastFetch = 0;
	private readonly _cacheTtlMs = 3_600_000;

	shouldRefresh(): boolean {
		return (
			this._cachedKeys.size === 0 ||
			Date.now() - this._lastFetch >= this._cacheTtlMs
		);
	}

	update(entries: ParsedJwk[]): void {
		this._cachedKeys = new Map<string, KeyObject>();
		for (const entry of entries) {
			this._cachedKeys.set(entry.kid, entry.key);
		}
		this._lastFetch = Date.now();
	}

	lookupByKid(kid: string): KeyObject | undefined {
		return this._cachedKeys.get(kid);
	}

	lookupSingleKey(): KeyObject | undefined {
		if (this._cachedKeys.size === 1) {
			return this._cachedKeys.values().next().value;
		}
	}

	hasKeys(): boolean {
		return this._cachedKeys.size > 0;
	}

	size(): number {
		return this._cachedKeys.size;
	}
}
