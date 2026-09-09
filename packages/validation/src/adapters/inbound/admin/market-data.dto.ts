import type { CandleData } from "@trading-model/common/config/event.types";
import type {
	Percentage,
	Price,
	TradingSymbol,
	Volume,
} from "@trading-model/common/domain/primitives";

export type Candle = CandleData;

export interface Ticker {
	symbol: TradingSymbol;
	price: Price;
	change24h: Percentage;
	high24h: Price;
	low24h: Price;
	volume24h: Volume;
}
