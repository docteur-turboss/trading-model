import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processBookTicker(
	buffer: MarketDataBuffer,
	data: unknown
): void {
	const parsed = data as { bookTicker?: { symbol: TradingSymbol }[] };
	if (!parsed?.bookTicker?.length) {
		return;
	}
	for (const ticker of parsed.bookTicker) {
		buffer.addData(DataType.BookTicker, ticker.symbol, ticker);
	}
}
