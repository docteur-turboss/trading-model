import type { FeatureVector } from "../feature-vector";
import type { SymbolState } from "../market-data-types";

export function buildSlidingWindowFeatures(
	features: FeatureVector,
	state: SymbolState,
	idx: number
): void {
	const sw = features.slidingWindow();
	const lookbackStart = Math.max(0, idx - 8);
	let swIdx = 0;
	for (let j = lookbackStart; j < idx && swIdx < sw.length; j++) {
		sw[swIdx++] = state.norm.candleClose.normalize(state.candles[j].close);
	}
	while (swIdx < sw.length) {
		sw[swIdx++] = 0;
	}
}
