import { Price, Volume } from "../domain/primitives";
import type { CandleData, OrderBookData, TradeData, TradeSide } from "./event.types";

export function getAvgBid(ob: OrderBookData): Price {
	let sum = 0;
	for (const bid of ob.bids) {
		sum += bid.price;
	}
	return Price.of(ob.bids.size > 0 ? sum / ob.bids.size : 0);
}

export function getAvgAsk(ob: OrderBookData): Price {
	let sum = 0;
	for (const ask of ob.asks) {
		sum += ask.price;
	}
	return Price.of(ob.asks.size > 0 ? sum / ob.asks.size : 0);
}

export function getSpread(ob: OrderBookData): Price {
	return Price.of(+getAvgAsk(ob) - +getAvgBid(ob));
}

export function getMidPrice(ob: OrderBookData): Price {
	return Price.of((+getAvgBid(ob) + +getAvgAsk(ob)) / 2);
}

export function getBidTotalQty(ob: OrderBookData): Volume {
	let qty = 0;
	for (const bid of ob.bids) {
		qty += bid.quantity;
	}
	return Volume.of(qty);
}

export function getAskTotalQty(ob: OrderBookData): Volume {
	let qty = 0;
	for (const ask of ob.asks) {
		qty += ask.quantity;
	}
	return Volume.of(qty);
}

export function isBullish(candle: CandleData): boolean {
	return candle.close >= candle.open;
}

export function getCandleBodySize(candle: CandleData): Price {
	return Price.of(Math.abs(+candle.close - +candle.open));
}

export function isBuyTrade(trade: TradeData): boolean {
	return trade.side === TradeSide.BUY;
}

export function isSellTrade(trade: TradeData): boolean {
	return trade.side === TradeSide.SELL;
}
