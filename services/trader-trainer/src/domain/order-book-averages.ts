import type { Price, Volume } from "@trading-model/primitives/primitives";

export interface OrderBookAverages {
	avgBid: Price;
	avgAsk: Price;
	bidQty: Volume;
	askQty: Volume;
}
