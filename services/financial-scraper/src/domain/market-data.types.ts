export type {
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/contracts/market-data.types";
export {
	MarketType,
	SourceType,
} from "@trading-model/contracts/market-data.types";

/**
 * One keyset page of a market data table (ADR-0054): rows in
 * (`timestamp`, `id`) order, strictly after `after`, `timestamp` in
 * [`from`, `to`), at most `limit` of them.
 */
export interface MarketDataPage {
	limit: number;
	/** Key of the last row of the previous page. */
	after?: { timestamp: number; id: number };
	/** Epoch milliseconds, inclusive. */
	from?: number;
	/** Epoch milliseconds, exclusive. */
	to?: number;
}
