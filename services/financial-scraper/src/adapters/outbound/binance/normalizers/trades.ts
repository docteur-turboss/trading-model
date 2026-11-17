import { TradeSide } from "@trading-model/contracts/market-data.types";
import {
	Price,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import type { TradeData } from "../../../../domain/market-data.types";
import { MarketType, SourceType } from "../../../../domain/market-data.types";
import type { BinanceTradeResponse } from "../binance.api";
import type { SymbolQuery } from "./query-types";

export function normalizeTrades(
	query: SymbolQuery,
	payload: BinanceTradeResponse
): TradeData[] {
	return payload.map((trade) => ({
		symbol: query.symbol,
		tradeId: BigInt(trade.id),
		price: Price.of(Number(trade.price)),
		quantity: Volume.of(Number(trade.qty)),
		timestamp: UnixTimestamp.of(trade.time),
		side: trade.isBuyerMaker ? TradeSide.Sell : TradeSide.Buy,
		source: SourceType.Binance,
		market: MarketType.Crypto,
	}));
}
