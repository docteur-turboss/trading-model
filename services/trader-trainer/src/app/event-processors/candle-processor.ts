import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processCandle(buffer: MarketDataBuffer, data: unknown): void {
	const d = data as { candle?: { symbol: TradingSymbol }[] };
	if (!d?.candle?.length) return;
	for (const item of d.candle) {
		buffer.addData("candle", item.symbol, item);
	}
}
