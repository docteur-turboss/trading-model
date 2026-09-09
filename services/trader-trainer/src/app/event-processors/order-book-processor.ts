import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import { processFirstItem } from "./process-list";

export function processOrderBook(
	buffer: MarketDataBuffer,
	data: unknown
): void {
	processFirstItem(buffer, data, "orderBook", DataType.OrderBook);
}
