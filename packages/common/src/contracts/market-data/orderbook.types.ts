import { Cash, Price, Volume } from "../../domain/primitives";
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

function avgPrice(levels: Set<OrderBookLevel>): Price {
	let totalQty = Volume.zero();
	let totalValue = Cash.zero();
	for (const { price, quantity } of levels) {
		totalValue = Cash.add(totalValue, Cash.fromProduct(quantity, price));
		totalQty = Volume.add(totalQty, quantity);
	}
	return Price.of(totalQty > 0 ? Number(totalValue) / Number(totalQty) : 0);
}

function totalQty(levels: Set<OrderBookLevel>): Volume {
	let total = Volume.zero();
	for (const { quantity } of levels) {
		total = Volume.add(total, quantity);
	}
	return total;
}

export function getAvgBid(orderBook: OrderBookData): Price {
	return avgPrice(orderBook.bids);
}

export function getAvgAsk(orderBook: OrderBookData): Price {
	return avgPrice(orderBook.asks);
}

export function getBidTotalQty(orderBook: OrderBookData): Volume {
	return totalQty(orderBook.bids);
}

export function getAskTotalQty(orderBook: OrderBookData): Volume {
	return totalQty(orderBook.asks);
}
