import type { FeatureVector } from "../feature-vector";
import type { SymbolState } from "../market-data-types";

export function buildTickerFeatures(
	features: FeatureVector,
	state: SymbolState
): void {
	if (state.ticker24h) {
		const tk = state.ticker24h;
		features.tickerPriceChange =
			tk.open > 0 ? (tk.last - tk.open) / tk.open : 0;
		features.tickerVolume = state.norm.tickerVolume.normalize(tk.volume);
		features.tickerDailyRange = tk.open > 0 ? (tk.high - tk.low) / tk.open : 0;
	}
}
