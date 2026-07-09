import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processOrderBook(
	buffer: MarketDataBuffer,
	data: unknown
): void {
	const parsed = data as { orderBook?: { symbol: TradingSymbol }[] };
	if (!parsed?.orderBook?.length) {
		return;
	}
	buffer.addData(
		DataType.OrderBook,
		parsed.orderBook[0].symbol,
		parsed.orderBook[0]
	);
}
