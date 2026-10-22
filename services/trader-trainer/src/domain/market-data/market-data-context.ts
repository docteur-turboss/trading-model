import type { Price } from "@trading-model/primitives/primitives";
import type { TradingSymbol } from "../market-data-types";

export interface MarketDataContext {
	symbol: TradingSymbol;
	priceSnapshot: Record<TradingSymbol, Price>;
}
