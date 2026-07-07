import { Price, Volume } from "../domain/primitives";
import type { OrderBookData } from "./event.types";

export function getAvgBid(orderBook: OrderBookData): Price {
	let totalQty = 0;
	let totalValue = 0;
	for (const { price, quantity } of orderBook.bids) {
		totalValue += Number(price) * Number(quantity);
		totalQty += Number(quantity);
	}
	return Price.of(totalQty > 0 ? totalValue / totalQty : 0);
}

export function getAvgAsk(orderBook: OrderBookData): Price {
	let totalQty = 0;
	let totalValue = 0;
	for (const { price, quantity } of orderBook.asks) {
		totalValue += Number(price) * Number(quantity);
		totalQty += Number(quantity);
	}
	return Price.of(totalQty > 0 ? totalValue / totalQty : 0);
}

export function getBidTotalQty(orderBook: OrderBookData): Volume {
	let total = 0;
	for (const { quantity } of orderBook.bids) {
		total += Number(quantity);
	}
	return Volume.of(total);
}

export function getAskTotalQty(orderBook: OrderBookData): Volume {
	let total = 0;
	for (const { quantity } of orderBook.asks) {
		total += Number(quantity);
	}
	return Volume.of(total);
}
