import type { SymbolInterval } from "@trading-model/contracts/candlestick-query";
import { logger } from "@trading-model/http/logger";
import {
	NonNegativeInt,
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
	const valid = payload.filter((candle) => {
		const [open, high, low, close] = [
			candle.open,
			candle.high,
			candle.low,
			candle.close,
		].map((price) => (price === "" ? Number.NaN : Number(price)));
		return (
			low > 0 && low <= open && low <= close && high >= open && high >= close
		);
	});
	if (valid.length < payload.length) {
		logger.warn(
			"Binance candles dropped: empty prices or low/high not bounding open/close",
			{
				context: {
					symbol: query.symbol,
					dropped: payload.length - valid.length,
				},
			}
		);
	}
	return valid.map((candle) => ({
		symbol: query.symbol,
		interval: query.interval,
		open: Price.of(Number(candle.open)),
		high: Price.of(Number(candle.high)),
		low: Price.of(Number(candle.low)),
		close: Price.of(Number(candle.close)),
		volume: Volume.of(Number(candle.volume)),
		closeTimestamp: UnixTimestamp.of(candle.closeTime),
		trades: NonNegativeInt.of(candle.numberOfTrades),
		timestamp: UnixTimestamp.of(candle.openTime),
		source: SourceType.Binance,
		market: MarketType.Crypto,
	}));
}
