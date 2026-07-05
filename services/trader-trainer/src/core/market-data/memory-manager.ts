import {
	type SymbolState,
	type TradingSymbol,
} from "../market-data-types";

/** Manages in-memory state limits with configurable eviction. */
export class MemoryManager {
	private readonly _maxSize: number;
	private readonly _maxMemoryBytes: number;
	private readonly _evictionPolicy: "LRU" | "none";
	private readonly _accessOrder: TradingSymbol[];
	private readonly _states: Map<TradingSymbol, SymbolState>;

	constructor(
		states: Map<TradingSymbol, SymbolState>,
		accessOrder: TradingSymbol[],
		maxSize: number,
		maxMemoryBytes: number,
		evictionPolicy: "LRU" | "none",
	) {
		this._states = states;
		this._accessOrder = accessOrder;
		this._maxSize = maxSize;
		this._maxMemoryBytes = maxMemoryBytes;
		this._evictionPolicy = evictionPolicy;
	}

	getMaxSize(): number {
		return this._maxSize;
	}

	recordAccess(symbol: TradingSymbol): void {
		if (this._evictionPolicy !== "LRU") {
			return;
		}
		const idx = this._accessOrder.indexOf(symbol);
		if (idx !== -1) {
			this._accessOrder.splice(idx, 1);
		}
		this._accessOrder.push(symbol);
	}

	enforceMemoryLimit(): void {
		if (this._evictionPolicy !== "LRU") {
			return;
		}

		let total = 0;
		for (const state of this._states.values()) {
			total += this._estimateMemoryBytes(state);
		}

		while (total > this._maxMemoryBytes && this._accessOrder.length > 1) {
			const victim = this._accessOrder.shift();
			if (!victim) {
				break;
			}
			const state = this._states.get(victim);
			if (state) {
				total -= this._estimateMemoryBytes(state);
			}
			this._states.delete(victim);
		}
	}

	private _estimateMemoryBytes(state: SymbolState): number {
		const candleBytes = state.candles.length * 200;
		const tradeBytes = state.trades.length * 100;
		const orderBookBytes = state.orderBook ? 5000 : 0;
		return candleBytes + tradeBytes + orderBookBytes;
	}
}
