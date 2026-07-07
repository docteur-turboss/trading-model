import type { SymbolInterval } from "@trading-model/common/domain/candlestick-query";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";

export interface SymbolQuery {
	symbol: TradingSymbol;
}

export interface CandleQuery extends SymbolInterval {}
