import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import { processList } from "./process-list";

export function processBookTicker(
	buffer: MarketDataBuffer,
	data: unknown
): void {
	processList(buffer, data, "bookTicker", DataType.BookTicker);
}
