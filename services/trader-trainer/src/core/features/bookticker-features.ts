import type { Ratio } from "@trading-model/common/domain/primitives";

export interface BookTickerFeatures {
	bid: number;
	ask: number;
	spreadRatio: Ratio;
}

export function emptyBookTicker(): BookTickerFeatures {
	return { bid: 0, ask: 0, spreadRatio: 0 as Ratio };
}
