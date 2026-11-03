import type { Ratio, Volume } from "@trading-model/primitives/primitives";

export interface TickerFeatures {
	priceChange: Ratio;
	volume: Volume;
	dailyRange: Ratio;
}

export function emptyTicker(): TickerFeatures {
	return {
		priceChange: 0 as Ratio,
		volume: 0 as Volume,
		dailyRange: 0 as Ratio,
	};
}
