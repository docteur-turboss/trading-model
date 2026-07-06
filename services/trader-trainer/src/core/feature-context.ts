import type { CandleData } from "@trading-model/common/config/event.types";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";
import type { SymbolState } from "./market-data-types";

/** Base context shared by all feature builder functions. */
export interface FeatureContext {
	features: Float32Array;
	state: SymbolState;
	idx: number;
}

export interface CandleFeatureContext extends FeatureContext {
	prev?: CandleData;
}

export interface PriceSnapshotFeatureContext extends FeatureContext {
	priceSnapshot: Record<TradingSymbol, number>;
}

export interface FeatureBuilderContext {
	state: SymbolState;
	idx: number;
	priceSnapshot: Record<TradingSymbol, number>;
}
