import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";
import { MemoryManager } from "./market-data/memory-manager";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import { NormalizationManager } from "./normalization-manager";
import { SymbolDataMutator } from "./symbol-data-mutator";
import { SymbolStateAccessor } from "./symbol-state-accessor";

export class SymbolStateManager {
	readonly states: Map<TradingSymbol, SymbolState> = new Map();
	readonly accessOrder: TradingSymbol[] = [];
	private readonly _memoryManager: MemoryManager;
	private readonly _normManager: NormalizationManager;
	private readonly _dataMutator: SymbolDataMutator;
	private readonly _stateAccessor: SymbolStateAccessor;

	constructor(
		maxSize: number,
		maxMemoryBytes: number,
		evictionPolicy: "LRU" | "none"
	) {
		this._memoryManager = new MemoryManager({
			states: this.states,
			accessOrder: this.accessOrder,
			maxSize,
			maxMemoryBytes,
			evictionPolicy,
		});
		this._normManager = new NormalizationManager();
		this._dataMutator = new SymbolDataMutator(
			this._memoryManager,
			this._normManager
		);
		this._stateAccessor = new SymbolStateAccessor(
			this._normManager,
			this._memoryManager
		);
	}

	getMemoryManager(): MemoryManager {
		return this._memoryManager;
	}

	getMaxSize(): number {
		return this._memoryManager.getMaxSize();
	}

	_getOrCreate(symbol: TradingSymbol): SymbolState {
		return this._stateAccessor.getOrCreate(symbol, this.states);
	}

	_getState(symbol: TradingSymbol): SymbolState {
		return this._stateAccessor.getState(symbol, this.states);
	}

	addCandles(symbol: TradingSymbol, candles: CandleData[]): void {
		const _state = this._getState(symbol);
		this._dataMutator.addCandles(
			symbol,
			candles,
			this.states,
			this._memoryManager.getMaxSize()
		);
	}

	addTrades(symbol: TradingSymbol, trades: TradeData[]): void {
		const _state = this._getState(symbol);
		this._dataMutator.addTrades(
			symbol,
			trades,
			this.states,
			this._memoryManager.getMaxSize()
		);
	}

	setOrderBook(symbol: TradingSymbol, orderBook: OrderBookData): void {
		const _state = this._getState(symbol);
		this._dataMutator.setOrderBook(symbol, orderBook, this.states);
	}

	setBookTicker(symbol: TradingSymbol, bt: BookTickerData): void {
		const _state = this._getState(symbol);
		this._dataMutator.setBookTicker(symbol, bt, this.states);
	}

	setTicker24h(symbol: TradingSymbol, ticker: TickerData): void {
		const _state = this._getState(symbol);
		this._dataMutator.setTicker24h(symbol, ticker, this.states);
	}

	getSymbols(): TradingSymbol[] {
		return Array.from(this.states.keys());
	}

	getSymbolState(symbol: TradingSymbol): SymbolState | undefined {
		const state = this.states.get(symbol);
		if (!state) {
			return;
		}
		return { ...state };
	}

	restoreSymbolState(symbol: TradingSymbol, state: SymbolState): void {
		this.states.set(symbol, state);
	}

	getCandleCount(symbol: TradingSymbol): number {
		return this.states.get(symbol)?.candles.length ?? 0;
	}
}
