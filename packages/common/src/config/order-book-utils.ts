import { Cash, Price, Volume } from "../domain/primitives";
import type { OrderBookData, OrderBookLevel } from "./event.types";

function avgPrice(levels: Set<OrderBookLevel>): Price {
	let totalQty = Volume.zero();
	let totalValue = Cash.zero();
	for (const { price, quantity } of levels) {
		totalValue = Cash.add(totalValue, Cash.fromProduct(quantity, price));
		totalQty = Volume.add(totalQty, quantity);
	}
	return Price.of(totalQty > 0 ? Number(totalValue) / Number(totalQty) : 0);
}

export function getAvgBid(orderBook: OrderBookData): Price {
	return avgPrice(orderBook.bids);
}

export function getAvgAsk(orderBook: OrderBookData): Price {
	return avgPrice(orderBook.asks);
}

function totalQty(levels: Set<OrderBookLevel>): Volume {
	let total = Volume.zero();
	for (const { quantity } of levels) {
		total = Volume.add(total, quantity);
	}
	return total;
}

export function getBidTotalQty(orderBook: OrderBookData): Volume {
	return totalQty(orderBook.bids);
}

export function getAskTotalQty(orderBook: OrderBookData): Volume {
	return totalQty(orderBook.asks);
}
