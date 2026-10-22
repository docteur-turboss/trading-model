import { DataType } from "../../../../domain/data-handlers/data-types";
import type { MarketDataBuffer } from "../../../../domain/market-data-buffer";
import { processList } from "./process-list";

export function processTicker(buffer: MarketDataBuffer, data: unknown): void {
	processList(buffer, data, "ticker", DataType.Ticker);
}
