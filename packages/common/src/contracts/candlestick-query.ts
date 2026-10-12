import type { Limit, TradingSymbol, UnixTimestamp } from "../domain/primitives";
import type { CandleInterval } from "./market-data.types";

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
