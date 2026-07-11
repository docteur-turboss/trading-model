import type { Ratio } from "@trading-model/common/domain/primitives";

export interface TickerFeatures {
	priceChange: Ratio;
	volume: number;
	dailyRange: Ratio;
}

export function emptyTicker(): TickerFeatures {
	return { priceChange: 0 as Ratio, volume: 0, dailyRange: 0 as Ratio };
}
