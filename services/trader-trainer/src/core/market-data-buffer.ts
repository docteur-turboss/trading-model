import {
	type BookTickerData,
	type CandleData,
	getAvgAsk,
	getAvgBid,
	type OrderBookData,
	type TickerData,
	type TradeData,
} from "@trading-model/common/config/event.types";

import type { MarketStep } from "./genetic-algorithm/genome-types";
import {
	fromSymbol,
	NormalizationStats,
	type SymbolState,
	type TradingSymbol,
	toSymbol,
} from "./market-data-types";
import { MemoryManager } from "./market-data/memory-manager";
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
	private _priceSnapshot: Record<TradingSymbol, number> = {} as Record<
		TradingSymbol,
		number
	>;
	private _memoryManager: MemoryManager;
	private _windowSplitter: WindowSplitter;

	constructor(config: MarketDataBufferConfig = {}) {
		const maxSize = config.maxSize ?? 10000;
		const maxMemoryBytes = (config.maxMemoryMb ?? 512) * 1024 * 1024;
		const evictionPolicy = config.evictionPolicy ?? "none";

		this._memoryManager = new MemoryManager(
			this._states,
			this._accessOrder,
			maxSize,
			maxMemoryBytes,
			evictionPolicy,
		);
		this._windowSplitter = new WindowSplitter(
			this._states,
			this._priceSnapshot,
		);
	}

	getMaxSize(): number {
		return this._memoryManager.getMaxSize();
	}

	private _getOrCreate(symbol: TradingSymbol): SymbolState {
		let state = this._states.get(symbol);
		if (!state) {
			state = {
				candles: [],
				trades: [],
				orderBook: null,
				bookTicker: null,
				ticker24h: null,
				norm: {
					candleClose: new NormalizationStats(),
					candleVolume: new NormalizationStats(),
					candleOpen: new NormalizationStats(),
					candleHigh: new NormalizationStats(),
					candleLow: new NormalizationStats(),
					tradePrice: new NormalizationStats(),
					tradeQty: new NormalizationStats(),
					bid: new NormalizationStats(),
					ask: new NormalizationStats(),
					spread: new NormalizationStats(),
					tickerVolume: new NormalizationStats(),
				},
			};
			this._states.set(symbol, state);
		}
		this._memoryManager.recordAccess(symbol);
		return state;
	}

	/** Append candlesticks and update running normalisers for price/volume features. */
	addCandles(symbol: string, candles: CandleData[]): void {
		const state = this._getOrCreate(toSymbol(symbol));
		for (const candle of candles) {
			state.candles.push(candle);
			state.norm.candleClose.update(candle.close);
			state.norm.candleVolume.update(candle.volume);
			state.norm.candleOpen.update(candle.open);
			state.norm.candleHigh.update(candle.high);
			state.norm.candleLow.update(candle.low);
		}
		if (state.candles.length > this._memoryManager.getMaxSize()) {
			state.candles = state.candles.slice(-this._memoryManager.getMaxSize());
		}
		this._memoryManager.enforceMemoryLimit();
	}

	/** Append recent trades and update price/quantity normalisers. */
	addTrades(symbol: string, trades: TradeData[]): void {
		const state = this._getOrCreate(toSymbol(symbol));
		for (const trade of trades) {
			state.trades.push(trade);
			state.norm.tradePrice.update(trade.price);
			state.norm.tradeQty.update(trade.quantity);
		}
		if (state.trades.length > this._memoryManager.getMaxSize()) {
			state.trades = state.trades.slice(-this._memoryManager.getMaxSize());
		}
		this._memoryManager.enforceMemoryLimit();
	}

	/** Store an order-book snapshot and update bid/ask/spread normalisers. */
	setOrderBook(symbol: string, orderBook: OrderBookData): void {
		const state = this._getOrCreate(toSymbol(symbol));
		state.orderBook = orderBook;

		const avgBid = getAvgBid(orderBook);
		const avgAsk = getAvgAsk(orderBook);

		if (avgBid > 0) {
			state.norm.bid.update(avgBid);
		}
		if (avgAsk > 0) {
			state.norm.ask.update(avgAsk);
		}
		if (avgAsk > 0 && avgBid > 0) {
			state.norm.spread.update(avgAsk - avgBid);
		}
		this._memoryManager.enforceMemoryLimit();
	}

	/** Store a book-ticker snapshot and update bid/ask/spread normalisers. */
	setBookTicker(symbol: string, bt: BookTickerData): void {
		const state = this._getOrCreate(toSymbol(symbol));
		state.bookTicker = bt;
		if (bt.bid > 0) {
			state.norm.bid.update(bt.bid);
		}
		if (bt.ask > 0) {
			state.norm.ask.update(bt.ask);
		}
		if (bt.ask > 0 && bt.bid > 0) {
			state.norm.spread.update(bt.ask - bt.bid);
		}
		this._memoryManager.enforceMemoryLimit();
	}

	/** Store a 24-hour ticker and update volume normaliser. */
	setTicker24h(symbol: string, ticker: TickerData): void {
		const state = this._getOrCreate(toSymbol(symbol));
		state.ticker24h = ticker;
		state.norm.tickerVolume.update(ticker.volume);
		this._memoryManager.enforceMemoryLimit();
	}

	/** Merge a snapshot of latest prices into the internal price map. */
	setPriceSnapshot(prices: Record<string, number>): void {
		this._priceSnapshot = { ...this._priceSnapshot, ...prices } as Record<
			TradingSymbol,
			number
		>;
	}

	/** Return a copy of the current price snapshot. */
	getPriceSnapshot(): Record<string, number> {
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
