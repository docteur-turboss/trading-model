import type { CandleData, OrderBookData, TradeData } from "./event.types";

export function getAvgBid(ob: OrderBookData): number {
	let sum = 0;
	for (const bid of ob.bids) {
		sum += bid.price;
	}
	return ob.bids.size > 0 ? sum / ob.bids.size : 0;
}

export function getAvgAsk(ob: OrderBookData): number {
	let sum = 0;
	for (const ask of ob.asks) {
		sum += ask.price;
	}
	return ob.asks.size > 0 ? sum / ob.asks.size : 0;
}

export function getSpread(ob: OrderBookData): number {
	return getAvgAsk(ob) - getAvgBid(ob);
}

export function getMidPrice(ob: OrderBookData): number {
	return (getAvgBid(ob) + getAvgAsk(ob)) / 2;
}

export function getBidTotalQty(ob: OrderBookData): number {
	let qty = 0;
	for (const bid of ob.bids) {
		qty += bid.quantity;
	}
	return qty;
}

export function getAskTotalQty(ob: OrderBookData): number {
	let qty = 0;
	for (const ask of ob.asks) {
		qty += ask.quantity;
	}
	return qty;
}

export function isBullish(candle: CandleData): boolean {
	return candle.close >= candle.open;
}

export function getCandleBodySize(candle: CandleData): number {
	return Math.abs(candle.close - candle.open);
}

export function isBuyTrade(trade: TradeData): boolean {
	return trade.side === "buy";
}

export function isSellTrade(trade: TradeData): boolean {
	return trade.side === "sell";
}
