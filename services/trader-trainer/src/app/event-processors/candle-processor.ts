import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processCandle(buffer: MarketDataBuffer, data: unknown): void {
	const parsed = data as { candle?: { symbol: TradingSymbol }[] };
	if (!parsed?.candle?.length) {
		return;
	}
	for (const item of parsed.candle) {
		buffer.addData(DataType.Candle, item.symbol, item);
	}
}
