import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { MarketType, SourceType } from "./enums";

export interface BaseMarketData {
	symbol: TradingSymbol;
	source: SourceType;
	timestamp: UnixTimestamp;
	market: MarketType;
}
