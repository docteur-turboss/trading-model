import type { CandleData } from "@trading-model/contracts/market-data.types";
import type {
	Price,
	TradingSymbol,
} from "@trading-model/primitives/primitives";
import type { FeatureVector } from "./feature-vector";
import type { SymbolState } from "./market-data-types";

/** Base context shared by all feature builder functions. */
export interface FeatureContext {
	features: FeatureVector;
	state: SymbolState;
	idx: number;
}

export interface CandleFeatureContext extends FeatureContext {
	prev?: CandleData;
}

export interface PriceSnapshotFeatureContext extends FeatureContext {
	priceSnapshot: Record<TradingSymbol, Price>;
}

export interface FeatureBuilderContext {
	state: SymbolState;
	idx: number;
	priceSnapshot: Record<TradingSymbol, Price>;
}
