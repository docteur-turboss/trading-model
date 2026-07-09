import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processTrade(buffer: MarketDataBuffer, data: unknown): void {
	const parsed = data as { trades?: { symbol: TradingSymbol }[] };
	if (!parsed?.trades?.length) {
		return;
	}
	for (const item of parsed.trades) {
		buffer.addData(DataType.Trade, item.symbol, item);
	}
}
