import type { SourceType } from "@trading-model/common/config/event.types";
import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { Table } from "ts-sql-query/Table";

import {
	createDBConnection,
	DATABASE,
	type DBConnection,
} from "../../../config/db";
import type { TickerData } from "../market-data.types";

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

	constructor() {
		super("market_tickers");
	}
})();

const SELECT = {
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

const UPSERT_SQL = `
	INSERT INTO market_tickers
		(symbol, market, source, open, high, low, last, volume, timestamp, close_time)
	VALUES ?
	ON DUPLICATE KEY UPDATE
		open = VALUES(open),
		high = VALUES(high),
		low = VALUES(low),
		last = VALUES(last),
		volume = VALUES(volume),
		close_time = VALUES(close_time)
`;

/** Upsert 24-hour ticker records into the market_tickers table (INSERT ... ON DUPLICATE KEY UPDATE). */
export const insertTicker = async (data: TickerData[]): Promise<void> => {
	if (!data.length) {
		return;
	}

	const rows = data.map((item) => [
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
	]);
	await DATABASE.promise().query(UPSERT_SQL, [rows]);
};

/** Query helpers for the market_tickers table, indexed by symbol, timestamp, and source. */
export const selectTickerBy = {
	symbol: async (symbol: TradingSymbol) => {
		return await createDBConnection()
			.selectFrom(T_MARKET_TICKER)
			.where(T_MARKET_TICKER.symbol.equals(symbol))
			.select(SELECT)
			.executeSelectMany();
	},
	timestamp: async (timestamp: UnixTimestamp) => {
		return await createDBConnection()
			.selectFrom(T_MARKET_TICKER)
			.where(T_MARKET_TICKER.timestamp.equals(new Date(timestamp)))
			.select(SELECT)
			.executeSelectMany();
	},
	source: async (source: SourceType) => {
		return await createDBConnection()
			.selectFrom(T_MARKET_TICKER)
			.where(T_MARKET_TICKER.source.equals(source))
			.select(SELECT)
			.executeSelectMany();
	},
};
