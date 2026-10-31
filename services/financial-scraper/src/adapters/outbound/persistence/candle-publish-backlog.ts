import type {
	CandleInterval,
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	PositiveInt,
	Price,
	type TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import type { RowDataPacket } from "mysql2";
import { DATABASE } from "../../../config/db";
import type { CandleData } from "../../../domain/market-data.types";
import type {
	CandlePublishBacklogPort,
	CandleSeries,
	PublishCursor,
} from "../../../domain/ports/candle-publish-backlog.port";

interface CursorRow extends RowDataPacket {
	market: string;
	published_until: Date;
}

interface CandleRow extends RowDataPacket {
	symbol: string;
	market: string;
	source: string;
	interval_value: string;
	open: string;
	high: string;
	low: string;
	close: string;
	volume: string;
	trades: number | null;
	timestamp: Date;
	close_timestamp: Date;
}

interface CountRow extends RowDataPacket {
	total: number;
}

const SERIES_WHERE =
	"source = ? AND symbol = ? AND interval_value = ? AND market = ? AND timestamp >= ?";

function seriesParams(
	series: CandleSeries,
	cursor: PublishCursor
): (string | Date)[] {
	return [
		series.source,
		series.symbol,
		series.interval,
		cursor.market,
		new Date(cursor.publishedUntil),
	];
}

/** Back to the shape the Binance normalizer produced (DECIMAL columns come back as strings). */
function toCandle(row: CandleRow): CandleData {
	const candle: CandleData = {
		symbol: row.symbol as TradingSymbol,
		market: row.market as MarketType,
		source: row.source as SourceType,
		interval: row.interval_value as CandleInterval,
		open: Price.of(Number(row.open)),
		high: Price.of(Number(row.high)),
		low: Price.of(Number(row.low)),
		close: Price.of(Number(row.close)),
		volume: Volume.of(Number(row.volume)),
		timestamp: UnixTimestamp.of(row.timestamp.getTime()),
		closeTimestamp: UnixTimestamp.of(row.close_timestamp.getTime()),
	};
	if (row.trades !== null && row.trades > 0) {
		candle.trades = PositiveInt.of(row.trades);
	}
	return candle;
}

/** Publish backlog on market_publish_cursors + market_candles (migration 005). */
export const MySqlCandlePublishBacklog: CandlePublishBacklogPort = {
	async cursor(series) {
		const [rows] = await DATABASE.promise().query<CursorRow[]>(
			"SELECT market, published_until FROM market_publish_cursors WHERE source = ? AND symbol = ? AND interval_value = ?",
			[series.source, series.symbol, series.interval]
		);
		const row = rows[0];
		return row
			? {
					market: row.market as MarketType,
					publishedUntil: UnixTimestamp.of(row.published_until.getTime()),
				}
			: undefined;
	},

	async saveCursor(series, cursor) {
		await DATABASE.promise().query(
			`INSERT INTO market_publish_cursors (source, symbol, interval_value, market, published_until)
			 VALUES (?, ?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE market = VALUES(market), published_until = VALUES(published_until)`,
			[
				series.source,
				series.symbol,
				series.interval,
				cursor.market,
				new Date(cursor.publishedUntil),
			]
		);
	},

	async candlesFrom(series, cursor, limit) {
		const [rows] = await DATABASE.promise().query<CandleRow[]>(
			`SELECT symbol, market, source, interval_value, open, high, low, close, volume, trades, timestamp, close_timestamp
			 FROM market_candles WHERE ${SERIES_WHERE} ORDER BY timestamp LIMIT ?`,
			[...seriesParams(series, cursor), limit]
		);
		return rows.map(toCandle);
	},

	async countFrom(series, cursor) {
		const [rows] = await DATABASE.promise().query<CountRow[]>(
			`SELECT COUNT(*) AS total FROM market_candles WHERE ${SERIES_WHERE}`,
			seriesParams(series, cursor)
		);
		return Number(rows[0]?.total ?? 0);
	},
};
