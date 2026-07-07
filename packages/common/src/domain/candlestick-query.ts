import type { CandleInterval } from "../config/event.types";
import type { TradingSymbol, UnixTimestamp } from "./primitives";

export interface MarketDataQuery {
	symbol: TradingSymbol;
	limit?: number;
}

export interface SymbolInterval {
	symbol: TradingSymbol;
	interval: CandleInterval;
}

export interface CandlestickQuery extends MarketDataQuery, SymbolInterval {
	startTime?: UnixTimestamp;
}
