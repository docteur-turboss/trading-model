import type { Price } from "@trading-model/primitives/primitives";
import { DataType } from "./data-handlers/data-types";
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
		});
		this._windowSplitter = new WindowSplitter(this._stateManager.states);
		this._onDataAdded = config.onDataAdded;
	}

	getMaxSize(): number {
		return this._stateManager.getMaxSize();
	}

	addData(dataType: DataType, symbol: TradingSymbol, data: unknown): void {
		this._stateManager.addData(dataType, symbol, data);
		this._onDataAdded?.(
			symbol,
			this.getCandleCount(symbol),
			this.getSymbols().length
		);
	}

	/**
	 * Latest prices, stamped `at` reception: a candle's features read the
	 * latest one known at its close (ADR-0030). Kept for tracked symbols only.
	 */
	setPriceSnapshot(
		prices: Record<TradingSymbol, Price>,
		at: number = Date.now()
	): void {
		for (const [symbol, price] of Object.entries(prices) as [
			TradingSymbol,
			Price,
		][]) {
			if (this._stateManager.states.has(symbol)) {
				this._stateManager.addData(DataType.Price, symbol, {
					price,
					timestamp: at,
				});
			}
		}
	}

	getSymbols(): TradingSymbol[] {
		return this._stateManager.getSymbols();
	}

	getSymbolState(symbol: TradingSymbol): SymbolState | undefined {
		return this._stateManager.getSymbolState(symbol);
	}

	/** Normalization statistics of a symbol (stored with its model, ADR-0022). */
	snapshotNormalization(symbol: TradingSymbol): Record<string, unknown> {
		return this._stateManager.serializeNorms(symbol);
	}

	restoreSymbolState(symbol: TradingSymbol, state: SymbolState): void {
		this._stateManager.restoreSymbolState(symbol, state);
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

	splitTrainValidation(
		steps: MarketStep[],
		validationSplit: number
	): WindowSet {
		return this._windowSplitter.splitTrainValidation(steps, validationSplit);
	}

	getAllWindows(
		symbol: TradingSymbol,
		validationSplit: number = DEFAULT_VALIDATION_SPLIT,
		walkForwardFolds = 1,
		testSplit: number = DEFAULT_TEST_SPLIT
	): WindowSet | WindowSet[] | null {
		const ctx: MarketDataContext = { symbol };
		return this._windowSplitter.getAllWindows(
			ctx,
			validationSplit,
			walkForwardFolds,
			testSplit
		);
	}
}
