import type { CandleInterval } from "../config/event.types";
import type { TradingSymbol, UnixTimestamp } from "./primitives";

export interface CandlestickQuery {
	symbol: TradingSymbol;
	interval: CandleInterval;
	limit?: number;
	startTime?: UnixTimestamp;
}
