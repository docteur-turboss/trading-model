import type { SourceType } from "@trading-model/contracts/market-data.types";
import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { Table } from "ts-sql-query/Table";

import type { DBConnection } from "../../../../config/db";
import type {
	MarketDataPage,
	TradeData,
} from "../../../../domain/market-data.types";
import { defineUpsert, type PageFilter, pagedQuery } from "./market-table";

const T_MARKET_TRADES = new (class TMarketTrades extends Table<
	DBConnection,
	"TMarketTrades"
> {
	symbol = this.primaryKey("symbol", "string");
	market = this.primaryKey("market", "string");
	source = this.primaryKey("source", "string");

	side = this.column("side", "string");
	price = this.column("price", "double");
	quantity = this.column("quantity", "double");
	tradeId = this.primaryKey("trade_id", "bigint");

	timestamp = this.primaryKey("timestamp", "localDateTime");

	/** AUTO_INCREMENT: tie-break of the page order (ADR-0054). */
	id = this.column("id", "int");

	constructor() {
		super("market_trades");
	}
})();

const SELECT = {
	id: T_MARKET_TRADES.id,
	side: T_MARKET_TRADES.side,
	price: T_MARKET_TRADES.price,
	symbol: T_MARKET_TRADES.symbol,
	market: T_MARKET_TRADES.market,
	source: T_MARKET_TRADES.source,
	tradeId: T_MARKET_TRADES.tradeId,
	quantity: T_MARKET_TRADES.quantity,
	timestamp: T_MARKET_TRADES.timestamp,
};

/** Upsert trade records into the market_trades table (INSERT ... ON DUPLICATE KEY UPDATE). */
export const insertTrades = defineUpsert<TradeData>({
	table: "market_trades",
	columns: [
		"symbol",
		"market",
		"source",
		"trade_id",
		"price",
		"quantity",
		"side",
		"timestamp",
	],
	update: ["price", "quantity", "side"],
	mapRow: (item) => [
		item.symbol,
		item.market,
		item.source,
		String(item.tradeId),
		item.price,
		item.quantity,
		item.side,
		new Date(item.timestamp),
	],
});

function _selectPage(
	filter: PageFilter<typeof T_MARKET_TRADES>,
	page: MarketDataPage
) {
	return pagedQuery(T_MARKET_TRADES, filter, page)
		.select(SELECT)
		.orderBy("timestamp")
		.orderBy("id")
		.limit(page.limit)
		.executeSelectMany();
}

/** Query helpers for the market_trades table, indexed by symbol, timestamp, and source. */
export const selectTradesBy = {
	symbol: (symbol: TradingSymbol, page: MarketDataPage) =>
		_selectPage(T_MARKET_TRADES.symbol.equals(symbol), page),
	timestamp: (timestamp: UnixTimestamp, page: MarketDataPage) =>
		_selectPage(T_MARKET_TRADES.timestamp.equals(new Date(timestamp)), page),
	source: (source: SourceType, page: MarketDataPage) =>
		_selectPage(T_MARKET_TRADES.source.equals(source), page),
};
