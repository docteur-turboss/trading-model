import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import { processList } from "./process-list";

export function processTicker(buffer: MarketDataBuffer, data: unknown): void {
	processList(buffer, data, "ticker", DataType.Ticker);
}
