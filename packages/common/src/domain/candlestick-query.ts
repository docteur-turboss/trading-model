import type { CandleInterval } from "../config/event.types";
import type { TradingSymbol, UnixTimestamp } from "./primitives";

export interface MarketDataQuery {
	symbol: TradingSymbol;
	limit?: number;
}

export interface CandlestickQuery extends MarketDataQuery {
	interval: CandleInterval;
	startTime?: UnixTimestamp;
}
