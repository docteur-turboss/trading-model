import type { SourceType } from "@trading-model/contracts/market-data.types";
import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { Table } from "ts-sql-query/Table";

import {
	createDBConnection,
	DATABASE,
	type DBConnection,
} from "../../../../config/db";
import type { CandleData } from "../../../../domain/market-data.types";

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

	constructor() {
		super("market_candles");
	}
})();

const SELECT = {
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

const UPSERT_SQL = `
	INSERT INTO market_candles
		(symbol, market, source, interval_value, open, high, low, close, volume, trades, timestamp, close_timestamp)
	VALUES ?
	ON DUPLICATE KEY UPDATE
		open = VALUES(open),
		high = VALUES(high),
		low = VALUES(low),
		close = VALUES(close),
		volume = VALUES(volume),
		trades = VALUES(trades),
		close_timestamp = VALUES(close_timestamp)
`;

/** Upsert candle records into the market_candles table (INSERT ... ON DUPLICATE KEY UPDATE). */
export const insertCandles = async (data: CandleData[]): Promise<void> => {
	if (!data.length) {
		return;
	}

	const rows = data.map((item) => [
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
	]);
	await DATABASE.promise().query(UPSERT_SQL, [rows]);
};

/** Query helpers for the market_candles table, indexed by symbol, timestamp, and source. */
export const selectCandlesBy = {
	symbol: async (symbol: TradingSymbol) => {
		return await createDBConnection()
			.selectFrom(T_MARKET_CANDLES)
			.where(T_MARKET_CANDLES.symbol.equals(symbol))
			.select(SELECT)
			.executeSelectMany();
	},
	timestamp: {
		after: async (timestamp: UnixTimestamp) => {
			return await createDBConnection()
				.selectFrom(T_MARKET_CANDLES)
				.where(T_MARKET_CANDLES.timestamp.greaterThan(new Date(timestamp)))
				.select(SELECT)
				.executeSelectMany();
		},
		before: async (timestamp: UnixTimestamp) => {
			return await createDBConnection()
				.selectFrom(T_MARKET_CANDLES)
				.where(T_MARKET_CANDLES.timestamp.lessThan(new Date(timestamp)))
				.select(SELECT)
				.executeSelectMany();
		},
	},
	source: async (source: SourceType) => {
		return await createDBConnection()
			.selectFrom(T_MARKET_CANDLES)
			.where(T_MARKET_CANDLES.source.equals(source))
			.select(SELECT)
			.executeSelectMany();
	},
};
