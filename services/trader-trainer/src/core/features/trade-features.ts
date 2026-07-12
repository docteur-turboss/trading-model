import type {
	Price,
	Ratio,
	Volume,
} from "@trading-model/common/domain/primitives";

export interface TradeFeatures {
	avgPrice: Price;
	totalQty: Volume;
	buyRatio: Ratio;
}

export function emptyTrade(): TradeFeatures {
	return { avgPrice: 0 as Price, totalQty: 0 as Volume, buyRatio: 0 as Ratio };
}
