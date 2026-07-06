import type { MarketStep } from "./genetic-algorithm/genome-types";
import { Price } from "@trading-model/common/domain/primitives";
import type {
	SymbolState,
	TradingSymbol,
} from "./market-data-types";
import {
	WindowSplitter,
	MIN_TRAINING_STEPS,
	DEFAULT_VALIDATION_SPLIT,
} from "./market-data/window-splitter";
import { SymbolStateManager } from "./symbol-state-manager";

export { MIN_TRAINING_STEPS, DEFAULT_VALIDATION_SPLIT };

export interface MarketDataBufferConfig {
	maxSize?: number;
	maxMemoryMb?: number;
	evictionPolicy?: "LRU" | "none";
}

export class MarketDataBuffer {
	private readonly _stateManager: SymbolStateManager;
	private _priceSnapshot: Record<TradingSymbol, Price> = {} as Record<TradingSymbol, Price>;
	private readonly _windowSplitter: WindowSplitter;

	constructor(config: MarketDataBufferConfig = {}) {
		this._stateManager = new SymbolStateManager(
			config.maxSize ?? 10000,
			(config.maxMemoryMb ?? 512) * 1024 * 1024,
			config.evictionPolicy ?? "none",
		);
		this._windowSplitter = new WindowSplitter(
			this._stateManager.states,
			this._priceSnapshot,
		);
	}

	getMaxSize(): number {
		return this._stateManager.getMaxSize();
	}

	addCandles(symbol: TradingSymbol, candles: import("@trading-model/common/config/event.types").CandleData[]): void {
		this._stateManager.addCandles(symbol, candles);
	}

	addTrades(symbol: TradingSymbol, trades: import("@trading-model/common/config/event.types").TradeData[]): void {
		this._stateManager.addTrades(symbol, trades);
	}

	setOrderBook(symbol: TradingSymbol, orderBook: import("@trading-model/common/config/event.types").OrderBookData): void {
		this._stateManager.setOrderBook(symbol, orderBook);
	}

	setBookTicker(symbol: TradingSymbol, bt: import("@trading-model/common/config/event.types").BookTickerData): void {
		this._stateManager.setBookTicker(symbol, bt);
	}

	setTicker24h(symbol: TradingSymbol, ticker: import("@trading-model/common/config/event.types").TickerData): void {
		this._stateManager.setTicker24h(symbol, ticker);
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
		return this._windowSplitter.buildMarketSteps(symbol);
	}

	splitTrainValidation(
		steps: MarketStep[],
		validationSplit: number,
	): { train: MarketStep[]; validation: MarketStep[]; id: string } {
		return this._windowSplitter.splitTrainValidation(steps, validationSplit);
	}

	getAllWindows(
		symbol: TradingSymbol,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT,
	): { id: string; train: MarketStep[]; validation: MarketStep[] } | null {
		return this._windowSplitter.getAllWindows(symbol, validationSplit);
	}
}
