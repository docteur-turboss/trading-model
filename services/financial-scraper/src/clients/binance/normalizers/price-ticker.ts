import { Price } from "@trading-model/common/domain/primitives";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";
import type { BinanceSymbolPriceTickerResponse } from "../../../types/binance.api";

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
