import { TradeSide } from "@trading-model/common/config/event.types";
import {
	Price,
	UnixTimestamp,
	Volume,
} from "@trading-model/common/domain/primitives";
import type { TradeData } from "../../../infra/market-data/market-data.types";
import {
	MarketType,
	SourceType,
} from "../../../infra/market-data/market-data.types";
import type {
	BinanceAggregateTradeResponse,
	BinanceHistoricalTradeResponse,
	BinanceTradeResponse,
} from "../../../types/binance.api";
import type { SymbolQuery } from "./query-types";

export function normalizeTrades(
	query: SymbolQuery,
	payload: BinanceTradeResponse | BinanceHistoricalTradeResponse
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

export function normalizeAggregateTrades(
	query: SymbolQuery,
	payload: BinanceAggregateTradeResponse
): TradeData[] {
	return payload.map((trade) => ({
		symbol: query.symbol,
		tradeId: BigInt(trade.aggregateTradeId),
		price: Price.of(Number(trade.price)),
		quantity: Volume.of(Number(trade.quantity)),
		timestamp: UnixTimestamp.of(trade.time),
		side: trade.isBuyerMaker ? TradeSide.Sell : TradeSide.Buy,
		source: SourceType.Binance,
		market: MarketType.Crypto,
	}));
}
