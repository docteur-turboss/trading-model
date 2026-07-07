import { Price, UnixTimestamp, Volume } from "@trading-model/common/domain/primitives";
import { MarketType, SourceType } from "../../../infra/market-data/market-data.types";
import type { TickerData } from "../../../infra/market-data/market-data.types";
import type {
	Binance24hrTickerStatsResponse,
	BinanceTradingDayTickerResponse,
} from "../../../types/binance.api";

export function normalizeTicker24h(payload: Binance24hrTickerStatsResponse): TickerData[] {
	return payload.map((item) => ({
		market: MarketType.CRYPTO,
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(item.openTime),
		symbol: item.symbol as import("@trading-model/common/domain/primitives").TradingSymbol,
		open: Price.of(Number(item.openPrice)),
		high: Price.of(Number(item.highPrice)),
		low: Price.of(Number(item.lowPrice)),
		last: Price.of(Number(item.lastPrice)),
		volume: Volume.of(Number(item.volume)),
		closeTimestamp: UnixTimestamp.of(item.closeTime),
	}));
}

export function normalizeTradingDayTicker(payload: BinanceTradingDayTickerResponse): TickerData[] {
	return payload.map((item) => ({
		market: MarketType.CRYPTO,
		source: SourceType.BINANCE,
		timestamp: UnixTimestamp.of(item.openTime),
		symbol: item.symbol as import("@trading-model/common/domain/primitives").TradingSymbol,
		open: Price.of(Number(item.openPrice)),
		high: Price.of(Number(item.highPrice)),
		low: Price.of(Number(item.lowPrice)),
		last: Price.of(Number(item.lastPrice)),
		volume: Volume.of(Number(item.volume)),
		closeTimestamp: UnixTimestamp.of(item.closeTime),
	}));
}
