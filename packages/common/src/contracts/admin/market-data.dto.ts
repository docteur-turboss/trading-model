import type { CandleData } from "../../config/event.types";

export type Candle = CandleData;

export interface Ticker {
	symbol: string;
	price: number;
	change24h: number;
	high24h: number;
	low24h: number;
	volume24h: number;
}
