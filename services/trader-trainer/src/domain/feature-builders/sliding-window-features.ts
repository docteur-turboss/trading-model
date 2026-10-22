import type { FeatureContext } from "../feature-context";

export function buildSlidingWindowFeatures(ctx: FeatureContext): void {
	const { features, state, idx } = ctx;
	const sw = features.slidingWindow();
	const lookbackStart = Math.max(0, idx - 8);
	let swIdx = 0;
	for (let j = lookbackStart; j < idx && swIdx < sw.length; j++) {
		sw[swIdx++] = state.norm.candle.close.normalize(state.candles[j].close);
	}
	while (swIdx < sw.length) {
		sw[swIdx++] = 0;
	}
}
