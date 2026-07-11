import type { Ratio } from "@trading-model/common/domain/primitives";

export interface TradeFeatures {
	avgPrice: number;
	totalQty: number;
	buyRatio: Ratio;
}

export function emptyTrade(): TradeFeatures {
	return { avgPrice: 0, totalQty: 0, buyRatio: 0 as Ratio };
}
