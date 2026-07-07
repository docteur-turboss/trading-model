import { DataType } from "../../core/data-handlers/data-types";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processTicker(buffer: MarketDataBuffer, data: unknown): void {
	const d = data as { ticker?: { symbol: TradingSymbol }[] };
	if (!d?.ticker?.length) return;
	for (const tk of d.ticker) {
		buffer.addData(DataType.Ticker, tk.symbol, tk);
	}
}
