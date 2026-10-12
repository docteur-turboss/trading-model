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
import type { TradeData } from "../market-data.types";

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

	constructor() {
		super("market_trades");
	}
})();

const SELECT = {
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

/** Query helpers for the market_trades table, indexed by symbol, timestamp, and source. */
export const selectTradesBy = {
	symbol: async (symbol: TradingSymbol) => {
		return await createDBConnection()
			.selectFrom(T_MARKET_TRADES)
			.where(T_MARKET_TRADES.symbol.equals(symbol))
			.select(SELECT)
			.executeSelectMany();
	},
	timestamp: async (timestamp: UnixTimestamp) => {
		return await createDBConnection()
			.selectFrom(T_MARKET_TRADES)
			.where(T_MARKET_TRADES.timestamp.equals(new Date(timestamp)))
			.select(SELECT)
			.executeSelectMany();
	},
	source: async (source: SourceType) => {
		return await createDBConnection()
			.selectFrom(T_MARKET_TRADES)
			.where(T_MARKET_TRADES.source.equals(source))
			.select(SELECT)
			.executeSelectMany();
	},
};
