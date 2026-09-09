import {
	Price,
	UnixTimestamp,
	Volume,
} from "@trading-model/common/domain/primitives";
import type { TickerData } from "../../../infra/market-data/market-data.types";
import {
	MarketType,
	SourceType,
} from "../../../infra/market-data/market-data.types";
import type {
	Binance24hrTickerStatsResponse,
	BinanceTickerBaseStats,
	BinanceTradingDayTickerResponse,
} from "../../../types/binance.api";

function normalizeTickers(payload: BinanceTickerBaseStats[]): TickerData[] {
	return payload.map((item) => ({
		market: MarketType.Crypto,
		source: SourceType.Binance,
		timestamp: UnixTimestamp.of(item.openTime),
		symbol: item.symbol,
		open: Price.of(Number(item.openPrice)),
		high: Price.of(Number(item.highPrice)),
		low: Price.of(Number(item.lowPrice)),
		last: Price.of(Number(item.lastPrice)),
		volume: Volume.of(Number(item.volume)),
		closeTimestamp: UnixTimestamp.of(item.closeTime),
	}));
}

export function normalizeTicker24h(
	payload: Binance24hrTickerStatsResponse
): TickerData[] {
	return normalizeTickers(payload);
}

export function normalizeTradingDayTicker(
	payload: BinanceTradingDayTickerResponse
): TickerData[] {
	return normalizeTickers(payload);
}
