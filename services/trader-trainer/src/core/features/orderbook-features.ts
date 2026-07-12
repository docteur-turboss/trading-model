import type { Price, Ratio } from "@trading-model/common/domain/primitives";

export interface OrderBookFeatures {
	avgBid: Price;
	avgAsk: Price;
	spreadRatio: Ratio;
	imbalance: Ratio;
}

export function emptyOrderBook(): OrderBookFeatures {
	return {
		avgBid: 0 as Price,
		avgAsk: 0 as Price,
		spreadRatio: 0 as Ratio,
		imbalance: 0 as Ratio,
	};
}
