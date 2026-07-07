import type { Price, Volume } from "@trading-model/common/domain/primitives";
import type { BidAsk } from "@trading-model/common/contracts/market-data.types";

export interface OrderBookAverages {
	avgBid: Price;
	avgAsk: Price;
	bidQty: Volume;
	askQty: Volume;
}
