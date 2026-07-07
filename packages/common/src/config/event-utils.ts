import { Price } from "../domain/primitives";
import type { CandleData, OrderBookData, TradeData } from "../contracts/market-data.types";
import { getAvgAsk, getAvgBid, TradeSide } from "../contracts/market-data.types";

export function getSpread(ob: OrderBookData): Price {
	return Price.of(Number(getAvgAsk(ob)) - Number(getAvgBid(ob)));
}

export function getMidPrice(ob: OrderBookData): Price {
	return Price.of((Number(getAvgBid(ob)) + Number(getAvgAsk(ob))) / 2);
}

export function isBullish(candle: CandleData): boolean {
	return candle.close >= candle.open;
}

export function getCandleBodySize(candle: CandleData): Price {
	return Price.of(Math.abs(Number(candle.close) - Number(candle.open)));
}

export function isBuyTrade(trade: TradeData): boolean {
	return trade.side === TradeSide.BUY;
}

export function isSellTrade(trade: TradeData): boolean {
	return trade.side === TradeSide.SELL;
}
