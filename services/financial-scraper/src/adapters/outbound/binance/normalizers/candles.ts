import type { SymbolInterval } from "@trading-model/contracts/candlestick-query";
import {
	PositiveInt,
	Price,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import type { CandleData } from "../../../../domain/market-data.types";
import { MarketType, SourceType } from "../../../../domain/market-data.types";
import type { BinanceCandlestickDataResponse } from "../binance.api";

export function normalizeCandles(
	query: SymbolInterval,
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
		trades: PositiveInt.of(candle.numberOfTrades),
		timestamp: UnixTimestamp.of(candle.openTime),
		source: SourceType.Binance,
		market: MarketType.Crypto,
	}));
}
