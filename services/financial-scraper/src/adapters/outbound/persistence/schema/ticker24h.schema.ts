import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { Table } from "ts-sql-query/Table";

import type { DBConnection } from "../../../../config/db";
import type {
	MarketDataPage,
	TickerData,
} from "../../../../domain/market-data.types";
import { defineUpsert, pagedSelect } from "./market-table";

const T_MARKET_TICKER = new (class TMarketTicker extends Table<
	DBConnection,
	"TMarketTicker"
> {
	symbol = this.primaryKey("symbol", "string");
	market = this.primaryKey("market", "string");
	source = this.primaryKey("source", "string");

	low = this.column("low", "double");
	open = this.column("open", "double");
	high = this.column("high", "double");
	last = this.column("last", "double");
	volume = this.column("volume", "double");

	timestamp = this.primaryKey("timestamp", "localDateTime");
	closeTimestamp = this.primaryKey("close_time", "localDateTime");

	/** AUTO_INCREMENT: tie-break of the page order (ADR-0054). */
	id = this.column("id", "int");

	constructor() {
		super("market_tickers");
	}
})();

const SELECT = {
	id: T_MARKET_TICKER.id,
	low: T_MARKET_TICKER.low,
	open: T_MARKET_TICKER.open,
	high: T_MARKET_TICKER.high,
	last: T_MARKET_TICKER.last,
	symbol: T_MARKET_TICKER.symbol,
	market: T_MARKET_TICKER.market,
	source: T_MARKET_TICKER.source,
	volume: T_MARKET_TICKER.volume,
	timestamp: T_MARKET_TICKER.timestamp,
	closeTimestamp: T_MARKET_TICKER.closeTimestamp,
};

/** Upsert 24-hour ticker records into the market_tickers table (INSERT ... ON DUPLICATE KEY UPDATE). */
export const insertTicker = defineUpsert<TickerData>({
	table: "market_tickers",
	columns: [
		"symbol",
		"market",
		"source",
		"open",
		"high",
		"low",
		"last",
		"volume",
		"timestamp",
		"close_time",
	],
	update: ["open", "high", "low", "last", "volume", "close_time"],
	mapRow: (item) => [
		item.symbol,
		item.market,
		item.source,
		item.open,
		item.high,
		item.low,
		item.last,
		item.volume,
		new Date(item.timestamp),
		new Date(item.closeTimestamp),
	],
});

/** Query helpers for the market_tickers table; index `(symbol, timestamp, id)` serves the paged symbol read (migrate.mjs `index-build`). */
export const selectTickerBy = {
	symbol: (symbol: TradingSymbol, page: MarketDataPage) =>
		pagedSelect(
			T_MARKET_TICKER,
			SELECT,
			T_MARKET_TICKER.symbol.equals(symbol),
			page
		),
	timestamp: (timestamp: UnixTimestamp, page: MarketDataPage) =>
		pagedSelect(
			T_MARKET_TICKER,
			SELECT,
			T_MARKET_TICKER.timestamp.equals(new Date(timestamp)),
			page
		),
};
