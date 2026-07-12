import type { Price, Ratio } from "@trading-model/common/domain/primitives";

export interface BookTickerFeatures {
	bid: Price;
	ask: Price;
	spreadRatio: Ratio;
}

export function emptyBookTicker(): BookTickerFeatures {
	return { bid: 0 as Price, ask: 0 as Price, spreadRatio: 0 as Ratio };
}
