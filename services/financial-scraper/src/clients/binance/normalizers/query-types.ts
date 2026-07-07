import type { CandleInterval } from "@trading-model/common/config/event.types";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";

export interface SymbolQuery {
	symbol: TradingSymbol;
}

export interface CandleQuery extends SymbolQuery {
	interval: CandleInterval;
}
