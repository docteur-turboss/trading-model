import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import { processList } from "./process-list";

export function processCandle(buffer: MarketDataBuffer, data: unknown): void {
	processList(buffer, data, "candle", DataType.Candle);
}
