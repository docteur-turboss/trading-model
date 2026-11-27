import type { CandleInterval } from "@trading-model/contracts/market-data.types";
import type {
	Limit,
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type {
	CandleData,
	OrderBookData,
	TickerData,
} from "./market-data.types";

/** What a scrape cycle asks a market data source for one symbol. */
export interface SnapshotRequest {
	symbol: TradingSymbol;
	interval?: CandleInterval;
	candleLimit?: Limit;
	/** Open time of the first candle to fetch; absent fetches the latest ones. */
	candleStartTime?: UnixTimestamp;
	orderBookLimit?: Limit;
	/** Fires when the cycle must stop: in-flight requests are cancelled and not retried. */
	signal?: AbortSignal;
}

/**
 * Normalized market data fetched for one symbol during a scrape cycle,
 * whatever the source. Candles hold closed candles only. A part the source
 * failed to fetch is absent: the others are still persisted.
 */
export interface MarketDataSnapshot {
	orderBook?: OrderBookData;
	candles?: CandleData[];
	ticker24h?: TickerData[];
	fetchedAt: number;
}

/** A kind of market data in a snapshot, fetched and persisted on its own. */
export type SnapshotPart = Exclude<keyof MarketDataSnapshot, "fetchedAt">;
