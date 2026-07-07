import type { Price } from "@trading-model/common/domain/primitives";
import type { MarketStep } from "./genetic-algorithm/genome-types";
import {
	DEFAULT_VALIDATION_SPLIT,
	MIN_TRAINING_STEPS,
	WindowSplitter,
} from "./market-data/window-splitter";
import type { MarketDataContext } from "./market-data/market-data-context";
import type { SymbolState, TradingSymbol } from "./market-data-types";
import { SymbolStateManager } from "./symbol-state-manager";
import { EvictionPolicy } from "./eviction-policy";

export { DEFAULT_VALIDATION_SPLIT, MIN_TRAINING_STEPS };

export interface MarketDataBufferConfig {
	maxSize?: number;
	maxMemoryMb?: number;
	evictionPolicy?: EvictionPolicy;
}

export class MarketDataBuffer {
	private readonly _stateManager: SymbolStateManager;
	private _priceSnapshot: Record<TradingSymbol, Price> = {} as Record<
		TradingSymbol,
		Price
	>;
	private readonly _windowSplitter: WindowSplitter;

	constructor(config: MarketDataBufferConfig = {}) {
		this._stateManager = new SymbolStateManager({
			maxSize: config.maxSize ?? 10000,
			maxMemoryBytes: (config.maxMemoryMb ?? 512) * 1024 * 1024,
			evictionPolicy: config.evictionPolicy ?? EvictionPolicy.None,
		});
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

	setPriceSnapshot(prices: Record<TradingSymbol, Price>): void {
		this._priceSnapshot = { ...this._priceSnapshot, ...prices };
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
		const ctx: MarketDataContext = { symbol, priceSnapshot: this._priceSnapshot };
		return this._windowSplitter.buildMarketSteps(ctx);
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
		const ctx: MarketDataContext = { symbol, priceSnapshot: this._priceSnapshot };
		return this._windowSplitter.getAllWindows(ctx, validationSplit);
	}
}
