import type { MemoryManager } from "./market-data/memory-manager";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import type { NormalizationManager } from "./normalization-manager";

export class SymbolStateAccessor {
	constructor(
		private readonly _normManager: NormalizationManager,
		private readonly _memoryManager: MemoryManager
	) {}

	getOrCreate(
		symbol: TradingSymbol,
		states: Map<TradingSymbol, SymbolState>
	): SymbolState {
		let state = states.get(symbol);
		if (!state) {
			state = this._createSymbolState();
			states.set(symbol, state);
		}
		this._memoryManager.recordAccess(symbol);
		return state;
	}

	getState(
		symbol: TradingSymbol,
		states: Map<TradingSymbol, SymbolState>
	): SymbolState {
		return this.getOrCreate(symbol, states);
	}

	private _createSymbolState(): SymbolState {
		return {
			candles: [],
			trades: [],
			orderBook: null,
			bookTicker: null,
			ticker24h: null,
			norm: this._normManager.createNormStats(),
		};
	}
}
