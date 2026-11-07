import type { SourceType } from "@trading-model/contracts/market-data.types";
import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { BooleanValueSource } from "ts-sql-query/expressions/values";
import { Table } from "ts-sql-query/Table";
import type { tableOrViewRef } from "ts-sql-query/utils/symbols";

import {
	createDBConnection,
	DATABASE,
	type DBConnection,
} from "../../../../config/db";
import type {
	CandleData,
	MarketDataPage,
} from "../../../../domain/market-data.types";

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

	/** AUTO_INCREMENT: tie-break of the page order (ADR-0053). */
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

/** One page in (timestamp, id) order: `filter`, then the window and the cursor of `page`. */
function _selectPage(
	filter: BooleanValueSource<
		(typeof T_MARKET_CANDLES)[typeof tableOrViewRef],
		"required"
	>,
	page: MarketDataPage
) {
	const table = T_MARKET_CANDLES;
	const after = new Date(page.after?.timestamp ?? 0);
	return createDBConnection()
		.selectFrom(table)
		.where(filter)
		.and(table.timestamp.largeAsIfValue(_date(page.from)))
		.and(table.timestamp.lessThanIfValue(_date(page.to)))
		.and(
			table.timestamp
				.greaterThan(after)
				.or(
					table.timestamp
						.equals(after)
						.and(table.id.greaterThan(page.after?.id ?? 0))
				)
				.onlyWhen(page.after !== undefined)
		)
		.select(SELECT)
		.orderBy("timestamp")
		.orderBy("id")
		.limit(page.limit)
		.executeSelectMany();
}

function _date(epochMs: number | undefined): Date | undefined {
	return epochMs === undefined ? undefined : new Date(epochMs);
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
