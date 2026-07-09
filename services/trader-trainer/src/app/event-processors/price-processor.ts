import type { Price } from "@trading-model/common/domain/primitives";
import type { MarketDataBuffer } from "../../core/market-data-buffer";
import type { TradingSymbol } from "../../core/market-data-types";

export function processPrice(buffer: MarketDataBuffer, data: unknown): void {
	const parsed = data as { price?: Record<TradingSymbol, Price> };
	if (!parsed?.price) {
		return;
	}
	buffer.setPriceSnapshot(parsed.price);
}
