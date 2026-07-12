import type {
	CandleData,
	OrderBookData,
	TradeData,
} from "@trading-model/validation/contracts/market-data.types";
import {
	getAvgAsk,
	getAvgBid,
	TradeSide,
} from "@trading-model/validation/contracts/market-data.types";
import { Price } from "../domain/primitives";

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
	return trade.side === TradeSide.Buy;
}

export function isSellTrade(trade: TradeData): boolean {
	return trade.side === TradeSide.Sell;
}
