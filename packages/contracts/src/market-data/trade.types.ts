import type { BaseMarketData } from "./base.types";
import type { TradeSide } from "./enums";
import type { OrderBookLevel } from "./orderbook.types";

export interface TradeData extends BaseMarketData, OrderBookLevel {
	tradeId: bigint;
	side: TradeSide;
}
