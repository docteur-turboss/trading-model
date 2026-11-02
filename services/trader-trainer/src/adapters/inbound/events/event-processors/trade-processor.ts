import { DataType } from "../../../../domain/data-handlers/data-types";
import type { MarketDataBuffer } from "../../../../domain/market-data-buffer";
import { processList } from "./process-list";

export function processTrade(buffer: MarketDataBuffer, data: unknown): void {
	processList(buffer, data, "trades", DataType.Trade);
}
