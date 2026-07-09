import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processTicker(buffer: MarketDataBuffer, data: unknown): void {
	const parsed = data as { ticker?: { symbol: TradingSymbol }[] };
	if (!parsed?.ticker?.length) {
		return;
	}
	for (const ticker of parsed.ticker) {
		buffer.addData(DataType.Ticker, ticker.symbol, ticker);
	}
}
