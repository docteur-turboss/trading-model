import type { Ratio } from "@trading-model/common/domain/primitives";

export interface OrderBookFeatures {
	avgBid: number;
	avgAsk: number;
	spreadRatio: Ratio;
	imbalance: Ratio;
}

export function emptyOrderBook(): OrderBookFeatures {
	return {
		avgBid: 0,
		avgAsk: 0,
		spreadRatio: 0 as Ratio,
		imbalance: 0 as Ratio,
	};
}
