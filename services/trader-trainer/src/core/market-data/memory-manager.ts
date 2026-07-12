import { EvictionPolicy } from "../eviction-policy";
import type { SymbolState, TradingSymbol } from "../market-data-types";
import type { MemoryConfig } from "../memory-config";

export interface MemoryManagerConfig extends MemoryConfig {
	states: Map<TradingSymbol, SymbolState>;
	accessOrder: TradingSymbol[];
}

/** Manages in-memory state limits with configurable eviction. */
export class MemoryManager {
	private readonly _maxSize: number;
	private readonly _maxMemoryBytes: number;
	private readonly _evictionPolicy: EvictionPolicy;
	private readonly _accessOrder: TradingSymbol[];
	private readonly _states: Map<TradingSymbol, SymbolState>;

	constructor(config: MemoryManagerConfig) {
		this._states = config.states;
		this._accessOrder = config.accessOrder;
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

	enforceMemoryLimit(): void {
		if (this._evictionPolicy !== EvictionPolicy.Lru) {
			return;
		}

		let total = this._computeTotalMemoryBytes();

		while (total > this._maxMemoryBytes && this._accessOrder.length > 1) {
			total = this._evictLeastRecent(total);
		}
	}

	private _computeTotalMemoryBytes(): number {
		let total = 0;
		for (const state of this._states.values()) {
			total += this._estimateMemoryBytes(state);
		}
		return total;
	}

	private _evictLeastRecent(total: number): number {
		const victim = this._accessOrder.shift();
		if (!victim) {
			return total;
		}
		const state = this._states.get(victim);
		if (state) {
			total -= this._estimateMemoryBytes(state);
		}
		this._states.delete(victim);
		return total;
	}

	private _estimateMemoryBytes(state: SymbolState): number {
		const candleBytes = state.candles.length * 200;
		const tradeBytes = state.trades.length * 100;
		const orderBookBytes = state.orderBook ? 5000 : 0;
		return candleBytes + tradeBytes + orderBookBytes;
	}
}
