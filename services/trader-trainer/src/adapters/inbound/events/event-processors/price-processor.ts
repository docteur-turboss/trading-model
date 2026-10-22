import type { Price } from "@trading-model/primitives/primitives";
import type { MarketDataBuffer } from "../../../../domain/market-data-buffer";
import type { TradingSymbol } from "../../../../domain/market-data-types";

export function processPrice(buffer: MarketDataBuffer, data: unknown): void {
	const parsed = data as { price?: Record<TradingSymbol, Price> };
	if (!parsed?.price) {
		return;
	}
	buffer.setPriceSnapshot(parsed.price);
}
