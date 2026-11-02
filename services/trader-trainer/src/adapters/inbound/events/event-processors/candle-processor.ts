import { DataType } from "../../../../domain/data-handlers/data-types";
import type { MarketDataBuffer } from "../../../../domain/market-data-buffer";
import { processList } from "./process-list";

export function processCandle(buffer: MarketDataBuffer, data: unknown): void {
	processList(buffer, data, "candle", DataType.Candle);
}
