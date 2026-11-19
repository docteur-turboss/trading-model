import type { FeatureContext } from "../feature-context";

/** Candles a step reads before its own: the splits leave this many steps between segments (issue #1648). */
export const FEATURE_LOOKBACK = 8;

export function buildSlidingWindowFeatures(ctx: FeatureContext): void {
	const { features, state, idx } = ctx;
	const sw = features.slidingWindow();
	const lookbackStart = Math.max(0, idx - FEATURE_LOOKBACK);
	let swIdx = 0;
	for (let j = lookbackStart; j < idx && swIdx < sw.length; j++) {
		sw[swIdx++] = state.norm.candle.close.normalize(state.candles[j].close);
	}
	while (swIdx < sw.length) {
		sw[swIdx++] = 0;
	}
}
