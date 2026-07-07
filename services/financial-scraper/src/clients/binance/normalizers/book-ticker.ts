import { Price, Volume } from "@trading-model/common/domain/primitives";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";
import type { BinanceSymbolOrderBookTickerResponse } from "../../../types/binance.api";

export function normalizeBookTicker(payload: BinanceSymbolOrderBookTickerResponse) {
	return payload.map((item) => ({
		symbol: item.symbol as TradingSymbol,
		bid: Price.of(Number(item.bidPrice)),
		ask: Price.of(Number(item.askPrice)),
		bidQty: Volume.of(Number(item.bidQty)),
		askQty: Volume.of(Number(item.askQty)),
	}));
}
