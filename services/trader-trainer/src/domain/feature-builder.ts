import type { CandleData } from "@trading-model/contracts/market-data.types";
import { FeatureVector } from "@trading-model/model-runtime/feature-vector";
import { buildCandleFeatures } from "./feature-builders/candle-features";
import { buildSlidingWindowFeatures } from "./feature-builders/sliding-window-features";
import type { FeatureBuilderContext } from "./feature-context";
import type { FeatureState } from "./market-data-types";

function initFeatures(
	state: FeatureState,
	idx: number
): { features: FeatureVector; prev: CandleData | undefined } {
	return {
		features: new FeatureVector(),
		prev: state.candles[idx - 1],
	};
}

export function buildFeatures(ctx: FeatureBuilderContext): FeatureVector {
	const { state, idx } = ctx;
	const { features, prev } = initFeatures(state, idx);

	buildCandleFeatures({ features, state, idx, prev });
	buildSlidingWindowFeatures({ features, state, idx });

	features.bias = 1.0;
	return features;
}
