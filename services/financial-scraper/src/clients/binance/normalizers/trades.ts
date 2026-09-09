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

function _normalizeTrade(
	query: SymbolQuery,
	fields: {
		id: number;
		price: string;
		quantity: string;
		time: number;
		isBuyerMaker: boolean;
	}
): TradeData {
	return {
		symbol: query.symbol,
		tradeId: BigInt(fields.id),
		price: Price.of(Number(fields.price)),
		quantity: Volume.of(Number(fields.quantity)),
		timestamp: UnixTimestamp.of(fields.time),
		side: fields.isBuyerMaker ? TradeSide.Sell : TradeSide.Buy,
		source: SourceType.Binance,
		market: MarketType.Crypto,
	};
}

export function normalizeTrades(
	query: SymbolQuery,
	payload: BinanceTradeResponse | BinanceHistoricalTradeResponse
): TradeData[] {
	return payload.map((trade) =>
		_normalizeTrade(query, {
			id: trade.id,
			price: trade.price,
			quantity: trade.qty,
			time: trade.time,
			isBuyerMaker: trade.isBuyerMaker,
		})
	);
}

export function normalizeAggregateTrades(
	query: SymbolQuery,
	payload: BinanceAggregateTradeResponse
): TradeData[] {
	return payload.map((trade) =>
		_normalizeTrade(query, {
			id: trade.aggregateTradeId,
			price: trade.price,
			quantity: trade.quantity,
			time: trade.time,
			isBuyerMaker: trade.isBuyerMaker,
		})
	);
}
