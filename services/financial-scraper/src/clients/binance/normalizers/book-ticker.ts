import {
	Price,
	TradingSymbol,
	Volume,
} from "@trading-model/common/domain/primitives";
import type { BinanceSymbolOrderBookTickerResponse } from "../../../types/binance.api";

export function normalizeBookTicker(
	payload: BinanceSymbolOrderBookTickerResponse
) {
	return payload.map((item) => ({
		symbol: TradingSymbol.of(item.symbol),
		bid: Price.of(Number(item.bidPrice)),
		ask: Price.of(Number(item.askPrice)),
		bidQty: Volume.of(Number(item.bidQty)),
		askQty: Volume.of(Number(item.askQty)),
	}));
}
