import type { CandleInterval } from "@trading-model/contracts/market-data.types";
import type {
	Limit,
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import type {
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "./market-data.types";

/** What a scrape cycle asks a market data source for one symbol. */
export interface SnapshotRequest {
	symbol: TradingSymbol;
	interval?: CandleInterval;
	candleLimit?: Limit;
	/** Open time of the first candle to fetch; absent fetches the latest ones. */
	candleStartTime?: UnixTimestamp;
	tradeLimit?: Limit;
	orderBookLimit?: Limit;
}

export interface BookTickerQuote {
	symbol: TradingSymbol;
	bid: Price;
	ask: Price;
	bidQty: Volume;
	askQty: Volume;
}

/**
 * Normalized market data fetched for one symbol during a scrape cycle,
 * whatever the source. Candles hold closed candles only. A part the source
 * failed to fetch is absent: the others are still persisted and published.
 */
export interface MarketDataSnapshot {
	orderBook?: OrderBookData;
	recentTrades?: TradeData[];
	candles?: CandleData[];
	ticker24h?: TickerData[];
	priceTicker?: Record<TradingSymbol, Price>;
	bookTicker?: BookTickerQuote[];
	fetchedAt: number;
}

/** A kind of market data in a snapshot, fetched and published on its own. */
export type SnapshotPart = Exclude<keyof MarketDataSnapshot, "fetchedAt">;
