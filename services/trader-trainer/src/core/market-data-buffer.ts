import type { Price } from "@trading-model/common/domain/primitives";
import type { MarketStep } from "./genetic-algorithm/genome-types";
import {
	DEFAULT_VALIDATION_SPLIT,
	MIN_TRAINING_STEPS,
	WindowSplitter,
} from "./market-data/window-splitter";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import { SymbolStateManager } from "./symbol-state-manager";

export { DEFAULT_VALIDATION_SPLIT, MIN_TRAINING_STEPS };

export interface MarketDataBufferConfig {
	maxSize?: number;
	maxMemoryMb?: number;
	evictionPolicy?: "LRU" | "none";
}

export class MarketDataBuffer {
	private readonly _stateManager: SymbolStateManager;
	private _priceSnapshot: Record<TradingSymbol, Price> = {} as Record<
		TradingSymbol,
		Price
	>;
	private readonly _windowSplitter: WindowSplitter;

	constructor(config: MarketDataBufferConfig = {}) {
		this._stateManager = new SymbolStateManager(
			config.maxSize ?? 10000,
			(config.maxMemoryMb ?? 512) * 1024 * 1024,
			config.evictionPolicy ?? "none"
		);
		this._windowSplitter = new WindowSplitter(
			this._stateManager.states
		);
	}

	getMaxSize(): number {
		return this._stateManager.getMaxSize();
	}

	addData(dataType: import("./data-handlers/data-handler").DataType, symbol: TradingSymbol, data: unknown): void {
		this._stateManager.addData(dataType, symbol, data);
	}

	/**
	 * @deprecated Use addData("candle", symbol, candle) for individual items.
	 */
	addCandles(
		symbol: TradingSymbol,
		candles: import("@trading-model/common/config/event.types").CandleData[]
	): void {
		for (const c of candles) {
			this._stateManager.addData("candle", symbol, c);
		}
	}

	/**
	 * @deprecated Use addData("trade", symbol, trade) for individual items.
	 */
	addTrades(
		symbol: TradingSymbol,
		trades: import("@trading-model/common/config/event.types").TradeData[]
	): void {
		for (const t of trades) {
			this._stateManager.addData("trade", symbol, t);
		}
	}

	/**
	 * @deprecated Use addData("orderBook", symbol, data).
	 */
	setOrderBook(
		symbol: TradingSymbol,
		orderBook: import("@trading-model/common/config/event.types").OrderBookData
	): void {
		this._stateManager.addData("orderBook", symbol, orderBook);
	}

	/**
	 * @deprecated Use addData("bookTicker", symbol, data).
	 */
	setBookTicker(
		symbol: TradingSymbol,
		bt: import("@trading-model/common/config/event.types").BookTickerData
	): void {
		this._stateManager.addData("bookTicker", symbol, bt);
	}

	/**
	 * @deprecated Use addData("ticker", symbol, data).
	 */
	setTicker24h(
		symbol: TradingSymbol,
		ticker: import("@trading-model/common/config/event.types").TickerData
	): void {
		this._stateManager.addData("ticker", symbol, ticker);
	}

	setPriceSnapshot(prices: Record<TradingSymbol, Price>): void {
		this._priceSnapshot = { ...this._priceSnapshot, ...prices };
	}

	getPriceSnapshot(): Record<TradingSymbol, Price> {
		return { ...this._priceSnapshot };
	}

	getSymbols(): TradingSymbol[] {
		return this._stateManager.getSymbols();
	}

	getSymbolState(symbol: TradingSymbol): SymbolState | undefined {
		return this._stateManager.getSymbolState(symbol);
	}

	restoreSymbolState(symbol: TradingSymbol, state: SymbolState): void {
		this._stateManager.restoreSymbolState(symbol, state);
	}

	getCandleCount(symbol: TradingSymbol): number {
		return this._stateManager.getCandleCount(symbol);
	}

	buildMarketSteps(symbol: TradingSymbol): MarketStep[] {
		return this._windowSplitter.buildMarketSteps(symbol, this._priceSnapshot);
	}

	splitTrainValidation(
		steps: MarketStep[],
		validationSplit: number
	): { train: MarketStep[]; validation: MarketStep[]; id: string } {
		return this._windowSplitter.splitTrainValidation(steps, validationSplit);
	}

	getAllWindows(
		symbol: TradingSymbol,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT
	): { id: string; train: MarketStep[]; validation: MarketStep[] } | null {
		return this._windowSplitter.getAllWindows(symbol, validationSplit, this._priceSnapshot);
	}
}
