import { Price } from "../domain/primitives";
import type { CandleData, OrderBookData, TradeData } from "./event.types";
import { TradeSide, getAvgBid, getAvgAsk, getBidTotalQty, getAskTotalQty } from "./event.types";

export function getSpread(ob: OrderBookData): Price {
	return Price.of(+getAvgAsk(ob) - +getAvgBid(ob));
}

export function getMidPrice(ob: OrderBookData): Price {
	return Price.of((+getAvgBid(ob) + +getAvgAsk(ob)) / 2);
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
