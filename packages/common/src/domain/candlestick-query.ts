import type { CandleInterval } from "../config/event.types";
import type { TradingSymbol } from "./primitives";

export interface CandlestickQuery {
	symbol: TradingSymbol;
	interval: CandleInterval;
	limit?: number;
	startTime?: number;
}
