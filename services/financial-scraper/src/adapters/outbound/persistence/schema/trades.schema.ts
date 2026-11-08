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
	TradeData,
} from "../../../../domain/market-data.types";

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

const UPSERT_SQL = `
	INSERT INTO market_trades
		(symbol, market, source, trade_id, price, quantity, side, timestamp)
	VALUES ?
	ON DUPLICATE KEY UPDATE
		price = VALUES(price),
		quantity = VALUES(quantity),
		side = VALUES(side)
`;

/** Upsert trade records into the market_trades table (INSERT ... ON DUPLICATE KEY UPDATE). */
export const insertTrades = async (data: TradeData[]): Promise<void> => {
	if (!data.length) {
		return;
	}

	const rows = data.map((item) => [
		item.symbol,
		item.market,
		item.source,
		String(item.tradeId),
		item.price,
		item.quantity,
		item.side,
		new Date(item.timestamp),
	]);
	await DATABASE.promise().query(UPSERT_SQL, [rows]);
};

/** One page in (timestamp, id) order: `filter`, then the window and the cursor of `page`. */
function _selectPage(
	filter: BooleanValueSource<
		(typeof T_MARKET_TRADES)[typeof tableOrViewRef],
		"required"
	>,
	page: MarketDataPage
) {
	const table = T_MARKET_TRADES;
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

/** Query helpers for the market_trades table, indexed by symbol, timestamp, and source. */
export const selectTradesBy = {
	symbol: (symbol: TradingSymbol, page: MarketDataPage) =>
		_selectPage(T_MARKET_TRADES.symbol.equals(symbol), page),
	timestamp: (timestamp: UnixTimestamp, page: MarketDataPage) =>
		_selectPage(T_MARKET_TRADES.timestamp.equals(new Date(timestamp)), page),
	source: (source: SourceType, page: MarketDataPage) =>
		_selectPage(T_MARKET_TRADES.source.equals(source), page),
};
