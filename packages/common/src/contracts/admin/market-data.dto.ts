import type { CandleData } from "../../config/event.types";
import type { Price, Volume } from "../../domain/primitives";

export type Candle = CandleData;

export interface Ticker {
	symbol: string;
	price: Price;
	change24h: number;
	high24h: Price;
	low24h: Price;
	volume24h: Volume;
}
