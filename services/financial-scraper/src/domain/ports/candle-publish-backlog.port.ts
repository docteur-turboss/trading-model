import type { CandleInterval } from "@trading-model/contracts/market-data.types";
import type {
	DataSource,
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { CandleData, MarketType } from "../market-data.types";

/** A candle series: one symbol and interval from one source. */
export interface CandleSeries {
	source: DataSource;
	symbol: TradingSymbol;
	interval: CandleInterval;
}

/** How far a series has been published to the bus. */
export interface PublishCursor {
	market: MarketType;
	/** Open time of the next candle to publish. */
	publishedUntil: UnixTimestamp;
}

/**
 * The persisted candles not yet published (implemented on MySQL). The
 * candles of a series from its cursor on wait for the bus: kept across
 * message-manager outages and scraper restarts.
 */
export interface CandlePublishBacklogPort {
	/** Undefined when nothing of the series was ever queued for the bus. */
	cursor(series: CandleSeries): Promise<PublishCursor | undefined>;
	saveCursor(series: CandleSeries, cursor: PublishCursor): Promise<void>;
	/** Persisted candles opened at or after `cursor.publishedUntil`, oldest first. */
	candlesFrom(
		series: CandleSeries,
		cursor: PublishCursor,
		limit: number
	): Promise<CandleData[]>;
	/** Number of persisted candles opened at or after `cursor.publishedUntil`. */
	countFrom(series: CandleSeries, cursor: PublishCursor): Promise<number>;
	/** Open time of the newest persisted candle of the series (undefined: none). */
	lastCandleOpenTime(series: CandleSeries): Promise<UnixTimestamp | undefined>;
}
