import type { Price, Volume } from "@trading-model/primitives/primitives";
import type { BaseMarketData } from "./base.types";

export interface OrderBookLevel {
	price: Price;
	quantity: Volume;
}

export interface OrderBookData extends BaseMarketData {
	bids: Set<OrderBookLevel>;
	asks: Set<OrderBookLevel>;
}

export interface BidAsk {
	bid: Price;
	ask: Price;
	bidQty?: Volume;
	askQty?: Volume;
}

export interface BookTickerData extends BaseMarketData, BidAsk {
	bidQty: Volume;
	askQty: Volume;
}
