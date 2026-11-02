import {
	type BookTickerData,
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import type { BinanceSymbolOrderBookTickerResponse } from "../binance.api";

/** Binance book tickers carry no timestamp: they are stamped at reception. */
export function normalizeBookTicker(
	payload: BinanceSymbolOrderBookTickerResponse
): BookTickerData[] {
	const timestamp = UnixTimestamp.now();
	return payload.map((item) => ({
		symbol: TradingSymbol.of(item.symbol),
		bid: Price.of(Number(item.bidPrice)),
		ask: Price.of(Number(item.askPrice)),
		bidQty: Volume.of(Number(item.bidQty)),
		askQty: Volume.of(Number(item.askQty)),
		source: SourceType.Binance,
		market: MarketType.Crypto,
		timestamp,
	}));
}
