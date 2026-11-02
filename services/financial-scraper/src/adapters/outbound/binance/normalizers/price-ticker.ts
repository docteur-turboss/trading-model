import type { TradingSymbol } from "@trading-model/primitives/primitives";
import { Price } from "@trading-model/primitives/primitives";
import type { BinanceSymbolPriceTickerResponse } from "../binance.api";

export function normalizePriceTicker(
	payload: BinanceSymbolPriceTickerResponse
): Record<TradingSymbol, Price> {
	return Object.fromEntries(
		payload.map((priceEntry) => [
			priceEntry.symbol,
			Price.of(Number(priceEntry.price)),
		])
	);
}
