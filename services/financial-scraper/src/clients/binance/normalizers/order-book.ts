import {
	MarketType,
	SourceType,
} from "@trading-model/common/config/event.types";
import type { OrderBookLevel } from "@trading-model/common/contracts/market-data.types";
import {
	Price,
	UnixTimestamp,
	Volume,
} from "@trading-model/common/domain/primitives";
import type { OrderBookData } from "../../../infra/market-data/market-data.types";
import type {
	BinanceDepthEntry,
	BinanceDepthResponse,
} from "../../../types/binance.api";
import type { SymbolQuery } from "./query-types";

function parseOrderBookSide(entries: BinanceDepthEntry[]): Set<OrderBookLevel> {
	return new Set(
		entries.map((entry) => ({
			price: Price.of(Number(entry.price)),
			quantity: Volume.of(Number(entry.qty)),
		}))
	);
}

export function normalizeOrderBook(
	query: SymbolQuery,
	payload: BinanceDepthResponse
): OrderBookData {
	return {
		symbol: query.symbol,
		source: SourceType.Binance,
		market: MarketType.Crypto,
		bids: parseOrderBookSide(payload.bids),
		asks: parseOrderBookSide(payload.asks),
		timestamp: UnixTimestamp.now(),
	};
}
