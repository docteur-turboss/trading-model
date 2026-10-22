import type { CandleData } from "@trading-model/contracts/market-data.types";
import type {
	Percentage,
	Price,
	TradingSymbol,
	Volume,
} from "@trading-model/primitives/primitives";

export type Candle = CandleData;

export interface Ticker {
	symbol: TradingSymbol;
	price: Price;
	change24h: Percentage;
	high24h: Price;
	low24h: Price;
	volume24h: Volume;
}
