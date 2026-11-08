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
	MarketDataPage,
	TickerData,
} from "../../../../domain/market-data.types";

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

/** One page in (timestamp, id) order: `filter`, then the window and the cursor of `page`. */
function _selectPage(
	filter: BooleanValueSource<
		(typeof T_MARKET_TICKER)[typeof tableOrViewRef],
		"required"
	>,
	page: MarketDataPage
) {
	const table = T_MARKET_TICKER;
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

/** Query helpers for the market_tickers table, indexed by symbol, timestamp, and source. */
export const selectTickerBy = {
	symbol: (symbol: TradingSymbol, page: MarketDataPage) =>
		_selectPage(T_MARKET_TICKER.symbol.equals(symbol), page),
	timestamp: (timestamp: UnixTimestamp, page: MarketDataPage) =>
		_selectPage(T_MARKET_TICKER.timestamp.equals(new Date(timestamp)), page),
	source: (source: SourceType, page: MarketDataPage) =>
		_selectPage(T_MARKET_TICKER.source.equals(source), page),
};
