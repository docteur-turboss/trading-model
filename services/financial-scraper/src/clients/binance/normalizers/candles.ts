import {
	Price,
	UnixTimestamp,
	Volume,
} from "@trading-model/common/domain/primitives";
import type { CandleData } from "../../../infra/market-data/market-data.types";
import {
	MarketType,
	SourceType,
} from "../../../infra/market-data/market-data.types";
import type { BinanceCandlestickDataResponse } from "../../../types/binance.api";
import type { CandleQuery } from "./query-types";

export function normalizeCandles(
	query: CandleQuery,
	payload: BinanceCandlestickDataResponse
): CandleData[] {
	return payload.map((candle) => ({
		symbol: query.symbol,
		interval: query.interval,
		open: Price.of(Number(candle.open)),
		high: Price.of(Number(candle.high)),
		low: Price.of(Number(candle.low)),
		close: Price.of(Number(candle.close)),
		volume: Volume.of(Number(candle.volume)),
		closeTimestamp: UnixTimestamp.of(candle.closeTime),
		trades: candle.numberOfTrades,
		timestamp: UnixTimestamp.of(candle.openTime),
		source: SourceType.Binance,
		market: MarketType.Crypto,
	}));
}
