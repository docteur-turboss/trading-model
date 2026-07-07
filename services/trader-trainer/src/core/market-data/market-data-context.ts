import type { Price } from "@trading-model/common/domain/primitives";
import type { TradingSymbol } from "../market-data-types";

export interface MarketDataContext {
	symbol: TradingSymbol;
	priceSnapshot: Record<TradingSymbol, Price>;
}
