import type { FeatureContext } from "../feature-context";

export function buildTickerFeatures(ctx: FeatureContext): void {
	const { features, state } = ctx;
	if (state.ticker24h) {
		const tk = state.ticker24h;
		features.ticker.priceChange =
			tk.open > 0 ? (tk.last - tk.open) / tk.open : 0;
		features.ticker.volume = state.norm.ticker.volume.normalize(tk.volume);
		features.ticker.dailyRange = tk.open > 0 ? (tk.high - tk.low) / tk.open : 0;
	}
}
