import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processBookTicker(buffer: MarketDataBuffer, data: unknown): void {
	const d = data as { bookTicker?: { symbol: TradingSymbol }[] };
	if (!d?.bookTicker?.length) return;
	for (const bt of d.bookTicker) {
		buffer.addData("bookTicker", bt.symbol, bt);
	}
}
