import type { CandleData } from "@trading-model/common/config/event.types";
import { buildBookTickerFeatures } from "./feature-builders/book-ticker-features";
import { buildCandleFeatures } from "./feature-builders/candle-features";
import { buildOrderBookFeatures } from "./feature-builders/order-book-features";
import { buildPriceSnapshotFeature } from "./feature-builders/price-snapshot-feature";
import { buildSlidingWindowFeatures } from "./feature-builders/sliding-window-features";
import { buildTickerFeatures } from "./feature-builders/ticker-features";
import { buildTradeFeatures } from "./feature-builders/trade-features";
import type { FeatureBuilderContext } from "./feature-context";
import { FeatureVector } from "./feature-vector";
import type { SymbolState } from "./market-data-types";

function initFeatures(
	state: SymbolState,
	idx: number
): { features: FeatureVector; prev: CandleData | undefined } {
	return {
		features: new FeatureVector(),
		prev: state.candles[idx - 1],
	};
}

export function buildFeatures(ctx: FeatureBuilderContext): FeatureVector {
	const { state, idx, priceSnapshot } = ctx;
	const { features, prev } = initFeatures(state, idx);

	buildCandleFeatures({ features, state, idx, prev });
	buildOrderBookFeatures({ features, state, idx });
	buildBookTickerFeatures({ features, state, idx });
	buildTradeFeatures({ features, state, idx });
	buildTickerFeatures(features, state);
	buildPriceSnapshotFeature({ features, state, idx, priceSnapshot });
	buildSlidingWindowFeatures(features, state, idx);

	features.bias = 1.0;
	return features;
}
