/** Weighted price averages and total quantities for an order book snapshot. */
export interface OrderBookAverages {
	avgBid: number;
	avgAsk: number;
	bidQty: number;
	askQty: number;
}
