import type { Price, Volume } from "@trading-model/common/domain/primitives";

export interface OrderBookAverages {
	avgBid: Price;
	avgAsk: Price;
	bidQty: Volume;
	askQty: Volume;
}
