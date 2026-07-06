import type { CandleInterval } from "../config/event.types";

export interface CandlestickQuery {
	symbol: string;
	interval: CandleInterval;
	limit?: number;
	startTime?: number;
}
