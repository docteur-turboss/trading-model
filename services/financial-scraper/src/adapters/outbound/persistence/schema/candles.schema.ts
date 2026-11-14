import type { SourceType } from "@trading-model/contracts/market-data.types";
import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { Table } from "ts-sql-query/Table";

import type { DBConnection } from "../../../../config/db";
import type {
	CandleData,
	MarketDataPage,
} from "../../../../domain/market-data.types";
import { defineUpsert, type PageFilter, pagedQuery } from "./market-table";

const T_MARKET_CANDLES = new (class TMarketCandles extends Table<
	DBConnection,
	"TMarketCandles"
> {
	symbol = this.primaryKey("symbol", "string");
	market = this.primaryKey("market", "string");
	source = this.primaryKey("source", "string");
	interval = this.primaryKey("interval_value", "string");

	low = this.column("low", "double");
	open = this.column("open", "double");
	high = this.column("high", "double");
	close = this.column("close", "double");
	volume = this.column("volume", "double");
	trades = this.optionalColumn("trades", "int");

	closeTimestamp = this.column("close_timestamp", "localDateTime");
	timestamp = this.primaryKey("timestamp", "localDateTime");

	/** AUTO_INCREMENT: tie-break of the page order (ADR-0054). */
	id = this.column("id", "int");

	constructor() {
		super("market_candles");
	}
})();

const SELECT = {
	id: T_MARKET_CANDLES.id,
	low: T_MARKET_CANDLES.low,
	open: T_MARKET_CANDLES.open,
	high: T_MARKET_CANDLES.high,
	close: T_MARKET_CANDLES.close,
	symbol: T_MARKET_CANDLES.symbol,
	market: T_MARKET_CANDLES.market,
	source: T_MARKET_CANDLES.source,
	volume: T_MARKET_CANDLES.volume,
	interval: T_MARKET_CANDLES.interval,
	trades: T_MARKET_CANDLES.trades,
	timestamp: T_MARKET_CANDLES.timestamp,
	closeTimestamp: T_MARKET_CANDLES.closeTimestamp,
};

/** Upsert candle records into the market_candles table (INSERT ... ON DUPLICATE KEY UPDATE). */
export const insertCandles = defineUpsert<CandleData>({
	table: "market_candles",
	columns: [
		"symbol",
		"market",
		"source",
		"interval_value",
		"open",
		"high",
		"low",
		"close",
		"volume",
		"trades",
		"timestamp",
		"close_timestamp",
	],
	update: [
		"open",
		"high",
		"low",
		"close",
		"volume",
		"trades",
		"close_timestamp",
	],
	mapRow: (item) => [
		item.symbol,
		item.market,
		item.source,
		item.interval,
		item.open,
		item.high,
		item.low,
		item.close,
		item.volume,
		item.trades ?? null,
		new Date(item.timestamp),
		new Date(item.closeTimestamp),
	],
});

function _selectPage(
	filter: PageFilter<typeof T_MARKET_CANDLES>,
	page: MarketDataPage
) {
	return pagedQuery(T_MARKET_CANDLES, filter, page)
		.select(SELECT)
		.orderBy("timestamp")
		.orderBy("id")
		.limit(page.limit)
		.executeSelectMany();
}

/** Query helpers for the market_candles table, indexed by symbol, timestamp, and source. */
export const selectCandlesBy = {
	symbol: (symbol: TradingSymbol, page: MarketDataPage) =>
		_selectPage(T_MARKET_CANDLES.symbol.equals(symbol), page),
	timestamp: {
		after: (timestamp: UnixTimestamp, page: MarketDataPage) =>
			_selectPage(
				T_MARKET_CANDLES.timestamp.greaterThan(new Date(timestamp)),
				page
			),
		before: (timestamp: UnixTimestamp, page: MarketDataPage) =>
			_selectPage(
				T_MARKET_CANDLES.timestamp.lessThan(new Date(timestamp)),
				page
			),
	},
	source: (source: SourceType, page: MarketDataPage) =>
		_selectPage(T_MARKET_CANDLES.source.equals(source), page),
};
