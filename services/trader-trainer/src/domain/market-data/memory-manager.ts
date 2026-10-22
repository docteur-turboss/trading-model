import { EvictionPolicy } from "../eviction-policy";
import type { TradingSymbol } from "../market-data-types";
import type { MemoryConfig } from "../memory-config";

/** Manages in-memory state limits with configurable eviction. */
export class MemoryManager {
	private readonly _maxSize: number;
	private readonly _maxMemoryBytes: number;
	private readonly _evictionPolicy: EvictionPolicy;
	private readonly _accessOrder: TradingSymbol[] = [];

	constructor(config: MemoryConfig) {
		this._maxSize = config.maxSize;
		this._maxMemoryBytes = config.maxMemoryBytes;
		this._evictionPolicy = config.evictionPolicy;
	}

	getMaxSize(): number {
		return this._maxSize;
	}

	recordAccess(symbol: TradingSymbol): void {
		if (this._evictionPolicy !== EvictionPolicy.Lru) {
			return;
		}
		const idx = this._accessOrder.indexOf(symbol);
		if (idx !== -1) {
			this._accessOrder.splice(idx, 1);
		}
		this._accessOrder.push(symbol);
	}

	/** Returns symbols to evict until memory is under limit. */
	enforceMemoryLimit(
		totalBytes: number,
		estimateBytes: (symbol: TradingSymbol) => number
	): TradingSymbol[] {
		if (this._evictionPolicy !== EvictionPolicy.Lru) {
			return [];
		}
		const victims: TradingSymbol[] = [];
		while (totalBytes > this._maxMemoryBytes && this._accessOrder.length > 1) {
			const victim = this._accessOrder.shift();
			if (!victim) {
				break;
			}
			victims.push(victim);
			totalBytes -= estimateBytes(victim);
		}
		return victims;
	}
}
