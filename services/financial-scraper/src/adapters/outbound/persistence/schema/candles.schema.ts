import {
	CandleInterval,
	type SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	type TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { RowDataPacket } from "mysql2";
import { Table } from "ts-sql-query/Table";
import type { CandleSeries } from "../../../../application/worker-orchestrator";
import { DATABASE, type DBConnection } from "../../../../config/db";
import type {
	CandleData,
	MarketDataPage,
} from "../../../../domain/market-data.types";
import { defineUpsert, pagedSelect } from "./market-table";

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

/** Query helpers for the market_candles table; index `(symbol, timestamp, id)` serves the paged symbol read (migrate.mjs `index-build`). */
export const selectCandlesBy = {
	symbol: (symbol: TradingSymbol, page: MarketDataPage) =>
		pagedSelect(
			T_MARKET_CANDLES,
			SELECT,
			T_MARKET_CANDLES.symbol.equals(symbol),
			page
		),
	timestamp: {
		after: (timestamp: UnixTimestamp, page: MarketDataPage) =>
			pagedSelect(
				T_MARKET_CANDLES,
				SELECT,
				T_MARKET_CANDLES.timestamp.greaterThan(new Date(timestamp)),
				page
			),
	},
};

interface LatestRow extends RowDataPacket {
	symbol: string;
	close: number;
	closeTimestamp: Date;
}

/** Older candles are past every risk-execution halt threshold (15 min); the bound keeps a read to one hour of rows per symbol, index-build done or not (issue #2592). */
const LATEST_WINDOW_MS = 3_600_000;
/** A slow read fails fast instead of holding one of the 10 pool connections. */
const LATEST_MAX_EXECUTION_MS = 2_000;
const LATEST_BRANCH = `(SELECT symbol, CAST(close AS DOUBLE) AS close, close_timestamp AS closeTimestamp FROM market_candles
 WHERE symbol = ? AND timestamp >= ? AND close_timestamp <= ? AND (? IS NULL OR source = ?) AND (? IS NULL OR interval_value = ?) ORDER BY close_timestamp DESC, id DESC LIMIT 1)`;

/** Newest candle closed by `now` and opened within the last hour (3 bars of `interval` when given), of each symbol, of the `source` and `interval` when given (one row per symbol, highest id on a tie). */
export async function selectLatestClosedCandles(
	symbols: readonly string[],
	now: Date,
	{ source, interval }: { source?: SourceType; interval?: CandleInterval } = {}
): Promise<LatestRow[]> {
	const unique = [...new Set(symbols)];
	const window = Math.max(
		LATEST_WINDOW_MS,
		interval ? 3 * CandleInterval.toMs(interval) : 0
	);
	const from = new Date(now.getTime() - window);
	const [rows] = await DATABASE.promise().query<LatestRow[]>(
		unique
			.map(() => LATEST_BRANCH)
			.join(" UNION ALL ")
			.replace(
				"SELECT",
				`SELECT /*+ MAX_EXECUTION_TIME(${LATEST_MAX_EXECUTION_MS}) */`
			),
		unique.flatMap((symbol) => [
			symbol,
			from,
			now,
			source ?? null,
			source ?? null,
			interval ?? null,
			interval ?? null,
		])
	);
	return rows;
}

interface LastRow extends RowDataPacket {
	last: Date | null;
}

/** Open time of the newest persisted candle of the series (undefined: none). */
export async function lastCandleOpenTime(
	series: CandleSeries
): Promise<UnixTimestamp | undefined> {
	const [rows] = await DATABASE.promise().query<LastRow[]>(
		"SELECT MAX(timestamp) AS last FROM market_candles WHERE source = ? AND symbol = ? AND interval_value = ?",
		[series.source, series.symbol, series.interval]
	);
	const last = rows[0]?.last;
	return last ? UnixTimestamp.of(last.getTime()) : undefined;
}
