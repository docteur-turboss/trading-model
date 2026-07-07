import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processOrderBook(buffer: MarketDataBuffer, data: unknown): void {
	const d = data as { orderBook?: { symbol: TradingSymbol }[] };
	if (!d?.orderBook?.length) return;
	buffer.addData("orderBook", d.orderBook[0].symbol, d.orderBook[0]);
}
