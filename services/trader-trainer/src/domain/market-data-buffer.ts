import type { CandleData } from "@trading-model/contracts/market-data.types";
import type { Signal } from "@trading-model/contracts/wire/signals";
import { EvictionPolicy } from "./eviction-policy";
import type { WindowSet } from "./genetic-algorithm/generation-types";
import type { MarketStep } from "./genetic-algorithm/genome";
import type { MarketDataContext } from "./market-data/market-data-context";
import {
	DEFAULT_TEST_SPLIT,
	DEFAULT_VALIDATION_SPLIT,
	MIN_TRAINING_STEPS,
	WindowSplitter,
} from "./market-data/window-splitter";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import { SymbolStateManager } from "./symbol-state-manager";

export { MIN_TRAINING_STEPS };

export interface MarketDataBufferConfig {
	maxSize?: number;
	maxMemoryBytes?: number;
	evictionPolicy?: EvictionPolicy;
	/** Signal metrics fed to the network after the market inputs (ADR-0081); empty: none. */
	signalKeys?: readonly string[];
	/** Called for each candle dropped because low/high do not bound open/close. */
	onInconsistentCandle?: (symbol: TradingSymbol) => void;
	/** Observability hook, called with the per-symbol candle count and the symbol count. */
	onDataAdded?: (
		symbol: TradingSymbol,
		candleCount: number,
		symbolCount: number
	) => void;
}

export class MarketDataBuffer {
	private readonly _stateManager: SymbolStateManager;
	private readonly _windowSplitter: WindowSplitter;
	private readonly _onDataAdded: MarketDataBufferConfig["onDataAdded"];

	constructor(config: MarketDataBufferConfig = {}) {
		this._stateManager = new SymbolStateManager({
			maxSize: config.maxSize ?? 10000,
			maxMemoryBytes: config.maxMemoryBytes ?? 512 * 1024 * 1024,
			evictionPolicy: config.evictionPolicy ?? EvictionPolicy.None,
			onInconsistentCandle: config.onInconsistentCandle,
		});
		this._windowSplitter = new WindowSplitter(
			this._stateManager.states,
			config.signalKeys
		);
		this._onDataAdded = config.onDataAdded;
	}

	getMaxSize(): number {
		return this._stateManager.getMaxSize();
	}

	addCandle(symbol: TradingSymbol, candle: CandleData): void {
		this._stateManager.addCandle(symbol, candle);
		this._onDataAdded?.(
			symbol,
			this.getCandleCount(symbol),
			this.getSymbols().length
		);
	}

	/** Sets the candles of a symbol to exactly this window (stored candles, ADR-0044). */
	replaceCandles(symbol: TradingSymbol, candles: CandleData[]): void {
		this._stateManager.replaceCandles(symbol, candles);
		this._onDataAdded?.(symbol, candles.length, this.getSymbols().length);
	}

	getSymbols(): TradingSymbol[] {
		return this._stateManager.getSymbols();
	}

	getSymbolState(symbol: TradingSymbol): SymbolState | undefined {
		return this._stateManager.getSymbolState(symbol);
	}

	/** Normalization statistics of a symbol (stored with its model, ADR-0022). */
	snapshotNormalization(symbol: TradingSymbol): Record<string, unknown> {
		const signals = this._windowSplitter.signalNormalization(symbol);
		return {
			...this._stateManager.serializeNorms(symbol),
			...(signals && { signals }),
		};
	}

	get signalKeys(): readonly string[] {
		return this._windowSplitter.signalKeys;
	}

	/** The signals the next windows of a symbol may read (point-in-time by observedAt). */
	setSignals(symbol: TradingSymbol, signals: readonly Signal[]): void {
		this._windowSplitter.setSignals(symbol, signals);
	}

	restoreSymbolState(symbol: TradingSymbol, state: SymbolState): void {
		this._stateManager.states.set(symbol, state);
	}

	getCandleCount(symbol: TradingSymbol): number {
		return this._stateManager.getCandleCount(symbol);
	}

	/** Close time of the newest buffered candle, undefined without candles. */
	getLastCandleCloseTime(symbol: TradingSymbol): number | undefined {
		const candles = this._stateManager.getSymbolState(symbol)?.candles ?? [];
		return candles[candles.length - 1]?.closeTimestamp;
	}

	buildMarketSteps(symbol: TradingSymbol): MarketStep[] {
		const ctx: MarketDataContext = { symbol };
		return this._windowSplitter.buildMarketSteps(ctx);
	}

	getAllWindows(
		symbol: TradingSymbol,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT,
		walkForwardFolds = 1,
		testSplit: number = DEFAULT_TEST_SPLIT
	): WindowSet[] | null {
		const ctx: MarketDataContext = { symbol };
		return this._windowSplitter.getAllWindows(
			ctx,
			validationSplit,
			walkForwardFolds,
			testSplit
		);
	}
}
