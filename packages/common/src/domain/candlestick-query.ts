import type { CandleInterval } from "../config/event.types";
import type { Limit, TradingSymbol, UnixTimestamp } from "./primitives";

export interface MarketDataQuery {
	symbol: TradingSymbol;
	limit?: Limit;
}

export interface SymbolInterval {
	symbol: TradingSymbol;
	interval: CandleInterval;
}

export interface CandlestickQuery extends MarketDataQuery, SymbolInterval {
	startTime?: UnixTimestamp;
}
