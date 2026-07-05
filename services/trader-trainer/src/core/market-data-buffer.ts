import {
	type BookTickerData,
	type CandleData,
	getAvgAsk,
	getAvgBid,
	type OrderBookData,
	type TickerData,
	type TradeData,
} from "@trading-model/common/config/event.types";

import { buildFeatures as buildFeaturesFn } from "./feature-builder";
import type { MarketStep } from "./genetic-algorithm/genome-types";
import {
	fromSymbol,
	NormalizationStats,
	type SymbolState,
	type TradingSymbol,
	toSymbol,
} from "./market-data-types";

/** Minimum number of market steps required before training can start. */
export const MIN_TRAINING_STEPS = 10;

/** Default fraction of data held out for validation during training. */
export const DEFAULT_VALIDATION_SPLIT = 0.2;

export interface MarketDataBufferConfig {
	maxSize?: number;
	maxMemoryMb?: number;
	evictionPolicy?: "LRU" | "none";
}

/** In-memory ring buffer of market data per symbol with online feature extraction. */
export class MarketDataBuffer {
	private _states: Map<TradingSymbol, SymbolState> = new Map();
	private _maxSize: number;
	private _maxMemoryBytes: number;
	private _evictionPolicy: "LRU" | "none";
	private _accessOrder: TradingSymbol[] = [];
	private _priceSnapshot: Record<TradingSymbol, number> = {} as Record<
		TradingSymbol,
		number
	>;

	constructor(config: MarketDataBufferConfig = {}) {
		this._maxSize = config.maxSize ?? 10000;
		this._maxMemoryBytes = (config.maxMemoryMb ?? 512) * 1024 * 1024;
		this._evictionPolicy = config.evictionPolicy ?? "none";
	}

	getMaxSize(): number {
		return this._maxSize;
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
		if (this._evictionPolicy === "LRU") {
			const idx = this._accessOrder.indexOf(symbol);
			if (idx !== -1) {
				this._accessOrder.splice(idx, 1);
			}
			this._accessOrder.push(symbol);
		}
		return state;
	}

	private _estimateMemoryBytes(state: SymbolState): number {
		const candleBytes = state.candles.length * 200;
		const tradeBytes = state.trades.length * 100;
		const orderBookBytes = state.orderBook ? 5000 : 0;
		return candleBytes + tradeBytes + orderBookBytes;
	}

	private _enforceMemoryLimit(): void {
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
		if (state.candles.length > this._maxSize) {
			state.candles = state.candles.slice(-this._maxSize);
		}
		this._enforceMemoryLimit();
	}

	/** Append recent trades and update price/quantity normalisers. */
	addTrades(symbol: string, trades: TradeData[]): void {
		const state = this._getOrCreate(toSymbol(symbol));
		for (const trade of trades) {
			state.trades.push(trade);
			state.norm.tradePrice.update(trade.price);
			state.norm.tradeQty.update(trade.quantity);
		}
		if (state.trades.length > this._maxSize) {
			state.trades = state.trades.slice(-this._maxSize);
		}
		this._enforceMemoryLimit();
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
		this._enforceMemoryLimit();
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
		this._enforceMemoryLimit();
	}

	/** Store a 24-hour ticker and update volume normaliser. */
	setTicker24h(symbol: string, ticker: TickerData): void {
		const state = this._getOrCreate(toSymbol(symbol));
		state.ticker24h = ticker;
		state.norm.tickerVolume.update(ticker.volume);
		this._enforceMemoryLimit();
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
		const state = this._states.get(toSymbol(symbol));
		if (!state || state.candles.length < 2) {
			return [];
		}

		const steps: MarketStep[] = [];
		for (let i = 1; i < state.candles.length; i++) {
			const features = buildFeaturesFn(state, i, this._priceSnapshot);
			steps.push({
				price: state.candles[i].close,
				features,
				timestamp: state.candles[i].timestamp,
			});
		}
		return steps;
	}

	/** Splits market steps into train/validation sets by a given ratio. */
	splitTrainValidation(
		steps: MarketStep[],
		validationSplit: number
	): { train: MarketStep[]; validation: MarketStep[]; id: string } {
		const splitIdx = Math.floor(steps.length * (1 - validationSplit));
		return {
			id: `window_${Date.now()}`,
			train: steps.slice(0, splitIdx),
			validation: steps.slice(splitIdx),
		};
	}

	/** Build a train/validation split from all available market steps, or null if insufficient data. */
	getAllWindows(
		symbol: string,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT
	): { id: string; train: MarketStep[]; validation: MarketStep[] } | null {
		const steps = this.buildMarketSteps(symbol);
		if (steps.length < MIN_TRAINING_STEPS) {
			return null;
		}
		return this.splitTrainValidation(steps, validationSplit);
	}
}
