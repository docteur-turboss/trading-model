import {
	type CandleData,
	type TradeData,
} from "@trading-model/common/config/event.types";

import type { MarketStep } from "./genetic-algorithm/genome-types";
import {
	fromSymbol,
	type SymbolState,
	type TradingSymbol,
	toSymbol,
} from "./market-data-types";
import { MemoryManager } from "./market-data/memory-manager";
import { NormalizationManager } from "./normalization-manager";
import {
	WindowSplitter,
	MIN_TRAINING_STEPS,
	DEFAULT_VALIDATION_SPLIT,
} from "./market-data/window-splitter";

export { MIN_TRAINING_STEPS, DEFAULT_VALIDATION_SPLIT };

export interface MarketDataBufferConfig {
	maxSize?: number;
	maxMemoryMb?: number;
	evictionPolicy?: "LRU" | "none";
}

/** In-memory ring buffer of market data per symbol with online feature extraction. */
export class MarketDataBuffer {
	private _states: Map<TradingSymbol, SymbolState> = new Map();
	private _accessOrder: TradingSymbol[] = [];
	private _priceSnapshot: Record<TradingSymbol, number> = {} as Record<TradingSymbol, number>;
	private _memoryManager: MemoryManager;
	private _windowSplitter: WindowSplitter;
	private _normManager: NormalizationManager;

	constructor(config: MarketDataBufferConfig = {}) {
		this._memoryManager = this._createMemoryManager(config);
		this._windowSplitter = new WindowSplitter(
			this._states,
			this._priceSnapshot,
		);
		this._normManager = new NormalizationManager();
	}

	private _createMemoryManager(config: MarketDataBufferConfig): MemoryManager {
		return new MemoryManager({
			states: this._states,
			accessOrder: this._accessOrder,
			maxSize: config.maxSize ?? 10000,
			maxMemoryBytes: (config.maxMemoryMb ?? 512) * 1024 * 1024,
			evictionPolicy: config.evictionPolicy ?? "none",
		});
	}

	getMaxSize(): number {
		return this._memoryManager.getMaxSize();
	}

	private _getOrCreate(symbol: TradingSymbol): SymbolState {
		let state = this._states.get(symbol);
		if (!state) {
			state = this._createSymbolState();
			this._states.set(symbol, state);
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

	/** Append candlesticks and update running normalisers for price/volume features. */
	addCandles(symbol: string, candles: CandleData[]): void {
		const state = this._getOrCreate(toSymbol(symbol));
		this._applyCandles(state, candles);
		state.candles = this._trimExcess(state.candles, this._memoryManager.getMaxSize());
		this._memoryManager.enforceMemoryLimit();
	}

	private _applyCandles(state: SymbolState, candles: CandleData[]): void {
		for (const candle of candles) {
			state.candles.push(candle);
			this._normManager.updateCandleNorms(state, candle);
		}
	}

	private _trimExcess<T>(arr: T[], maxSize: number): T[] {
		return arr.length > maxSize ? arr.slice(-maxSize) : arr;
	}

	/** Append recent trades and update price/quantity normalisers. */
	addTrades(symbol: string, trades: TradeData[]): void {
		const state = this._getOrCreate(toSymbol(symbol));
		this._applyTrades(state, trades);
		state.trades = this._trimExcess(state.trades, this._memoryManager.getMaxSize());
		this._memoryManager.enforceMemoryLimit();
	}

	private _applyTrades(state: SymbolState, trades: TradeData[]): void {
		for (const trade of trades) {
			state.trades.push(trade);
			this._normManager.updateTradeNorms(state, trade);
		}
	}

	/** Store an order-book snapshot and update bid/ask/spread normalisers. */
	setOrderBook(symbol: string, orderBook: OrderBookData): void {
		const state = this._getOrCreate(toSymbol(symbol));
		state.orderBook = orderBook;
		this._normManager.updateOrderBookNorms(state, orderBook);
		this._memoryManager.enforceMemoryLimit();
	}

	/** Store a book-ticker snapshot and update bid/ask/spread normalisers. */
	setBookTicker(symbol: string, bt: BookTickerData): void {
		const state = this._getOrCreate(toSymbol(symbol));
		state.bookTicker = bt;
		this._normManager.updateBookTickerNorms(state, bt);
		this._memoryManager.enforceMemoryLimit();
	}

	/** Store a 24-hour ticker and update volume normaliser. */
	setTicker24h(symbol: string, ticker: TickerData): void {
		const state = this._getOrCreate(toSymbol(symbol));
		state.ticker24h = ticker;
		this._normManager.updateTicker24hNorms(state, ticker);
		this._memoryManager.enforceMemoryLimit();
	}

	/** Merge a snapshot of latest prices into the internal price map. */
	setPriceSnapshot(prices: Record<TradingSymbol, number>): void {
		this._priceSnapshot = { ...this._priceSnapshot, ...prices };
	}

	/** Return a copy of the current price snapshot. */
	getPriceSnapshot(): Record<TradingSymbol, number> {
		return { ...this._priceSnapshot };
	}

	getSymbols(): string[] {
		return Array.from(this._states.keys()).map(fromSymbol);
	}

	/** Return a shallow copy of the state for a symbol, or undefined. */
	getSymbolState(symbol: string): SymbolState | undefined {
		const state = this._states.get(toSymbol(symbol));
		if (!state) {
			return;
		}
		return { ...state };
	}

	/** Restore a full symbol state from a previously saved snapshot. */
	restoreSymbolState(symbol: string, state: SymbolState): void {
		this._states.set(toSymbol(symbol), state);
	}

	getCandleCount(symbol: string): number {
		return this._states.get(toSymbol(symbol))?.candles.length ?? 0;
	}

	/** Builds a feature vector for each candle step (N candles → N-1 steps). */
	buildMarketSteps(symbol: string): MarketStep[] {
		return this._windowSplitter.buildMarketSteps(symbol);
	}

	/** Splits market steps into train/validation sets by a given ratio. */
	splitTrainValidation(
		steps: MarketStep[],
		validationSplit: number,
	): { train: MarketStep[]; validation: MarketStep[]; id: string } {
		return this._windowSplitter.splitTrainValidation(steps, validationSplit);
	}

	/** Build a train/validation split from all available market steps, or null if insufficient data. */
	getAllWindows(
		symbol: string,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT,
	): { id: string; train: MarketStep[]; validation: MarketStep[] } | null {
		return this._windowSplitter.getAllWindows(symbol, validationSplit);
	}
}
