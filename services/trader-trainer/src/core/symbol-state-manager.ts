import {
	type BookTickerData,
	type CandleData,
	type OrderBookData,
	type TickerData,
	type TradeData,
} from "@trading-model/common/config/event.types";

import type {
	SymbolState,
	TradingSymbol,
} from "./market-data-types";
import { MemoryManager } from "./market-data/memory-manager";
import { NormalizationManager } from "./normalization-manager";

export class SymbolStateManager {
	readonly states: Map<TradingSymbol, SymbolState> = new Map();
	readonly accessOrder: TradingSymbol[] = [];
	private readonly _memoryManager: MemoryManager;
	private readonly _normManager: NormalizationManager;

	constructor(
		maxSize: number,
		maxMemoryBytes: number,
		evictionPolicy: "LRU" | "none",
	) {
		this._memoryManager = new MemoryManager({
			states: this.states,
			accessOrder: this.accessOrder,
			maxSize,
			maxMemoryBytes,
			evictionPolicy,
		});
		this._normManager = new NormalizationManager();
	}

	getMemoryManager(): MemoryManager {
		return this._memoryManager;
	}

	getMaxSize(): number {
		return this._memoryManager.getMaxSize();
	}

	_getOrCreate(symbol: TradingSymbol): SymbolState {
		let state = this.states.get(symbol);
		if (!state) {
			state = this._createSymbolState();
			this.states.set(symbol, state);
		}
		this._memoryManager.recordAccess(symbol);
		return state;
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

	_getState(symbol: TradingSymbol): SymbolState {
		return this._getOrCreate(symbol);
	}

	private _trimExcess<T>(arr: T[], maxSize: number): T[] {
		return arr.length > maxSize ? arr.slice(-maxSize) : arr;
	}

	addCandles(symbol: TradingSymbol, candles: CandleData[]): void {
		const state = this._getState(symbol);
		for (const candle of candles) {
			state.candles.push(candle);
			this._normManager.updateCandleNorms(state, candle);
		}
		state.candles = this._trimExcess(state.candles, this._memoryManager.getMaxSize());
		this._memoryManager.enforceMemoryLimit();
	}

	addTrades(symbol: TradingSymbol, trades: TradeData[]): void {
		const state = this._getState(symbol);
		for (const trade of trades) {
			state.trades.push(trade);
			this._normManager.updateTradeNorms(state, trade);
		}
		state.trades = this._trimExcess(state.trades, this._memoryManager.getMaxSize());
		this._memoryManager.enforceMemoryLimit();
	}

	setOrderBook(symbol: TradingSymbol, orderBook: OrderBookData): void {
		const state = this._getState(symbol);
		state.orderBook = orderBook;
		this._normManager.updateOrderBookNorms(state, orderBook);
		this._memoryManager.enforceMemoryLimit();
	}

	setBookTicker(symbol: TradingSymbol, bt: BookTickerData): void {
		const state = this._getState(symbol);
		state.bookTicker = bt;
		this._normManager.updateBookTickerNorms(state, bt);
		this._memoryManager.enforceMemoryLimit();
	}

	setTicker24h(symbol: TradingSymbol, ticker: TickerData): void {
		const state = this._getState(symbol);
		state.ticker24h = ticker;
		this._normManager.updateTicker24hNorms(state, ticker);
		this._memoryManager.enforceMemoryLimit();
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
